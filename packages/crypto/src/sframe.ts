import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { FrameCipherStats } from './types.js';

export const SFRAME_EPOCH_ROLLOVER_THRESHOLD = 65536; // Ratchet every 65,536 frames
export const SFRAME_GCM_TAG_BYTES = 16;

export interface SFrameMetadata {
  epoch: number;
  counter: number;
  cipherPayloadLength: number;
}

export class SFrameCipher {
  private baseKey: Uint8Array;
  private salt: Uint8Array;
  private currentEpoch: number = 0;
  private frameCounter: number = 0;
  private cryptoKeys: Map<number, CryptoKey> = new Map();
  private replayWindow: Set<number> = new Set();
  private maxSeenCounter: number = -1;

  public stats: FrameCipherStats = {
    framesEncrypted: 0,
    framesDecrypted: 0,
    bytesProcessed: 0,
    lastLatencyMicros: 0,
    averageLatencyMicros: 0,
    droppedOrCorruptFrames: 0,
  };

  private latencySumMicros: number = 0;
  private padToBlockSize: number;

  constructor(baseKey: Uint8Array, salt: Uint8Array, padToBlockSize: number = 0) {
    this.baseKey = baseKey;
    this.salt = salt;
    this.padToBlockSize = padToBlockSize;
  }

  /**
   * Derives or retrieves an epoch-specific CryptoKey using HKDF.
   */
  public async getEpochKey(epoch: number): Promise<CryptoKey> {
    if (this.cryptoKeys.has(epoch)) {
      return this.cryptoKeys.get(epoch)!;
    }

    const info = new TextEncoder().encode(`sframe-epoch-key-v1:${epoch}`);
    const derivedRaw = hkdf(sha256, this.baseKey, this.salt, info, 32);

    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      derivedRaw as unknown as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );

    this.cryptoKeys.set(epoch, cryptoKey);
    return cryptoKey;
  }

  /**
   * Explicitly triggers a key ratchet to the next epoch.
   */
  public async ratchetEpoch(): Promise<number> {
    this.currentEpoch++;
    this.frameCounter = 0;
    await this.getEpochKey(this.currentEpoch);
    return this.currentEpoch;
  }

  public getCurrentEpoch(): number {
    return this.currentEpoch;
  }

  private constructIV(epoch: number, counter: number): Uint8Array {
    const iv = new Uint8Array(12);
    // Salt in first 4 bytes
    iv[0] = this.salt[0] ^ (epoch & 0xff);
    iv[1] = this.salt[1] ^ ((epoch >> 8) & 0xff);
    iv[2] = this.salt[2];
    iv[3] = this.salt[3];

    // Big-endian 64-bit counter representation in remaining 8 bytes
    const view = new DataView(iv.buffer);
    view.setUint32(4, Math.floor(counter / 0x100000000), false);
    view.setUint32(8, counter >>> 0, false);
    return iv;
  }

  /**
   * Encrypts a media frame with SFrame encapsulation:
   * Header: [EPOCH 2B] [COUNTER 4B]
   * Payload: [CIPHERTEXT...] [TAG 16B]
   */
  public async encryptFrame(frameData: Uint8Array): Promise<Uint8Array> {
    const t0 = performance.now();

    // Auto-ratchet epoch if counter threshold reached
    if (this.frameCounter >= SFRAME_EPOCH_ROLLOVER_THRESHOLD) {
      await this.ratchetEpoch();
    }

    this.frameCounter = (this.frameCounter + 1) >>> 0;
    const counter = this.frameCounter;
    const epoch = this.currentEpoch;

    const key = await this.getEpochKey(epoch);
    const iv = this.constructIV(epoch, counter);

    // 6-byte SFrame header: 2 bytes epoch + 4 bytes counter
    const header = new Uint8Array(6);
    const headerView = new DataView(header.buffer);
    headerView.setUint16(0, epoch, false);
    headerView.setUint32(2, counter, false);

    let payloadToEncrypt = frameData;
    if (this.padToBlockSize > 0) {
      // PKCS-style length-prefixed block quantization (RFC 9605 audio padding)
      const originalLength = frameData.byteLength;
      const targetLength = Math.max(
        this.padToBlockSize,
        Math.ceil((originalLength + 2) / this.padToBlockSize) * this.padToBlockSize
      );
      const padded = new Uint8Array(targetLength);
      const view = new DataView(padded.buffer);
      view.setUint16(0, originalLength, false);
      padded.set(frameData, 2);
      if (targetLength > originalLength + 2) {
        globalThis.crypto.getRandomValues(padded.subarray(originalLength + 2));
      }
      payloadToEncrypt = padded;
    }

    const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
        additionalData: header as unknown as BufferSource,
        tagLength: 128,
      },
      key,
      payloadToEncrypt as unknown as BufferSource
    );

    const result = new Uint8Array(6 + ciphertextBuffer.byteLength);
    result.set(header, 0);
    result.set(new Uint8Array(ciphertextBuffer), 6);

    const t1 = performance.now();
    const latencyMicros = Math.round((t1 - t0) * 1000);
    this.recordStats(latencyMicros, result.byteLength, true);

    return result;
  }

  /**
   * Decrypts an SFrame payload and enforces replay protection.
   */
  public async decryptFrame(sframeData: Uint8Array): Promise<Uint8Array> {
    const t0 = performance.now();

    if (sframeData.byteLength < 6 + SFRAME_GCM_TAG_BYTES) {
      this.stats.droppedOrCorruptFrames++;
      throw new Error(`SFrame payload too short: ${sframeData.byteLength} bytes`);
    }

    const headerView = new DataView(sframeData.buffer, sframeData.byteOffset, 6);
    const epoch = headerView.getUint16(0, false);
    const counter = headerView.getUint32(2, false);

    // Sliding window replay attack detection
    if (this.isReplayed(counter)) {
      this.stats.droppedOrCorruptFrames++;
      throw new Error(`Replay attack detected: duplicate counter ${counter}`);
    }

    const key = await this.getEpochKey(epoch);
    const iv = this.constructIV(epoch, counter);

    const header = sframeData.subarray(0, 6);
    const ciphertextWithTag = sframeData.subarray(6);

    try {
      const plaintextBuffer = await globalThis.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv as unknown as BufferSource,
          additionalData: header as unknown as BufferSource,
          tagLength: 128,
        },
        key,
        ciphertextWithTag as unknown as BufferSource
      );

      this.markCounterSeen(counter);

      const t1 = performance.now();
      const latencyMicros = Math.round((t1 - t0) * 1000);
      let result = new Uint8Array(plaintextBuffer);

      if (this.padToBlockSize > 0 && result.byteLength >= 2) {
        const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
        const originalLength = view.getUint16(0, false);
        if (originalLength <= result.byteLength - 2) {
          result = result.subarray(2, 2 + originalLength);
        }
      }

      this.recordStats(latencyMicros, result.byteLength, false);

      return result;
    } catch (err) {
      this.stats.droppedOrCorruptFrames++;
      throw new Error('SFrame authentication failed or corrupted payload');
    }
  }

  private isReplayed(counter: number): boolean {
    if (this.replayWindow.has(counter)) return true;
    // Reject frames older than window depth (1024 frames behind max seen)
    if (this.maxSeenCounter > 1024 && counter < this.maxSeenCounter - 1024) {
      return true;
    }
    return false;
  }

  private markCounterSeen(counter: number): void {
    this.replayWindow.add(counter);
    if (counter > this.maxSeenCounter) {
      this.maxSeenCounter = counter;
    }
    // Prune replay window
    if (this.replayWindow.size > 2048) {
      const threshold = this.maxSeenCounter - 1024;
      for (const c of this.replayWindow) {
        if (c < threshold) this.replayWindow.delete(c);
      }
    }
  }

  private recordStats(latencyMicros: number, bytes: number, isEncrypt: boolean): void {
    if (isEncrypt) {
      this.stats.framesEncrypted++;
    } else {
      this.stats.framesDecrypted++;
    }
    this.stats.bytesProcessed += bytes;
    this.stats.lastLatencyMicros = latencyMicros;
    this.latencySumMicros += latencyMicros;
    const total = this.stats.framesEncrypted + this.stats.framesDecrypted;
    this.stats.averageLatencyMicros = Math.round(this.latencySumMicros / total);
  }
}
