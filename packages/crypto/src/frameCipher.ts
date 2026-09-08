import { FrameCipherStats } from './types.js';

export const FRAME_MAGIC_BYTE = 0xAE;
export const CURRENT_KEY_VERSION = 0x01;
export const HEADER_OVERHEAD_BYTES = 6; // 1 magic + 1 version + 4 counter
export const GCM_TAG_BYTES = 16;
export const TOTAL_FRAME_OVERHEAD = HEADER_OVERHEAD_BYTES + GCM_TAG_BYTES; // 22 bytes

export class FrameCipher {
  private cryptoKey: CryptoKey | null = null;
  private rawKey: Uint8Array;
  private ivBase: Uint8Array; // 12 bytes
  private frameCounter: number = 0;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  public stats: FrameCipherStats = {
    framesEncrypted: 0,
    framesDecrypted: 0,
    bytesProcessed: 0,
    lastLatencyMicros: 0,
    averageLatencyMicros: 0,
    droppedOrCorruptFrames: 0,
  };

  private latencySumMicros: number = 0;

  constructor(key: Uint8Array, ivBase: Uint8Array) {
    this.rawKey = key;
    this.ivBase = ivBase;
    this.initPromise = this.init();
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      throw new Error('SubtleCrypto is not available in this environment');
    }

    this.cryptoKey = await subtle.importKey(
      'raw',
      this.rawKey as unknown as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
    this.isInitialized = true;
  }

  public async ready(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  private constructIV(counter: number): Uint8Array {
    const iv = new Uint8Array(12);
    // First 8 bytes from ivBase salt
    iv.set(this.ivBase.slice(0, 8), 0);
    // Last 4 bytes from big-endian frame counter
    const view = new DataView(iv.buffer);
    view.setUint32(8, counter, false);
    return iv;
  }

  /**
   * Encrypts a raw WebRTC encoded frame's payload.
   * Frame structure: [MAGIC 1B] [KEY_VER 1B] [COUNTER 4B] [CIPHERTEXT...] [TAG 16B]
   */
  public async encryptFrame(frameData: Uint8Array): Promise<Uint8Array> {
    await this.ready();
    const t0 = performance.now();

    this.frameCounter = (this.frameCounter + 1) >>> 0;
    const counter = this.frameCounter;
    const iv = this.constructIV(counter);

    // Build 6-byte header for Additional Authenticated Data (AAD)
    const header = new Uint8Array(HEADER_OVERHEAD_BYTES);
    header[0] = FRAME_MAGIC_BYTE;
    header[1] = CURRENT_KEY_VERSION;
    const headerView = new DataView(header.buffer);
    headerView.setUint32(2, counter, false);

    const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
        additionalData: header as unknown as BufferSource,
        tagLength: 128,
      },
      this.cryptoKey!,
      frameData as unknown as BufferSource
    );

    // Combine: [Header (6B)] + [Ciphertext + Tag (N + 16B)]
    const result = new Uint8Array(HEADER_OVERHEAD_BYTES + ciphertextBuffer.byteLength);
    result.set(header, 0);
    result.set(new Uint8Array(ciphertextBuffer), HEADER_OVERHEAD_BYTES);

    const t1 = performance.now();
    const latencyMicros = Math.round((t1 - t0) * 1000);
    this.recordStats(latencyMicros, result.byteLength, true);

    return result;
  }

  /**
   * Decrypts an encrypted WebRTC frame payload.
   */
  public async decryptFrame(encryptedFrame: Uint8Array): Promise<Uint8Array> {
    await this.ready();
    const t0 = performance.now();

    // Check minimum frame size
    if (encryptedFrame.byteLength < TOTAL_FRAME_OVERHEAD) {
      this.stats.droppedOrCorruptFrames++;
      throw new Error(`Encrypted frame too short: ${encryptedFrame.byteLength} bytes`);
    }

    // Verify magic byte
    if (encryptedFrame[0] !== FRAME_MAGIC_BYTE) {
      this.stats.droppedOrCorruptFrames++;
      throw new Error(`Invalid frame magic byte: 0x${encryptedFrame[0].toString(16)}`);
    }

    // Extract counter & construct IV
    const headerView = new DataView(encryptedFrame.buffer, encryptedFrame.byteOffset, HEADER_OVERHEAD_BYTES);
    const counter = headerView.getUint32(2, false);
    const iv = this.constructIV(counter);

    // Header is authenticated data (AAD)
    const header = encryptedFrame.subarray(0, HEADER_OVERHEAD_BYTES);
    const ciphertextWithTag = encryptedFrame.subarray(HEADER_OVERHEAD_BYTES);

    try {
      const plaintextBuffer = await globalThis.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv as unknown as BufferSource,
          additionalData: header as unknown as BufferSource,
          tagLength: 128,
        },
        this.cryptoKey!,
        ciphertextWithTag as unknown as BufferSource
      );

      const t1 = performance.now();
      const latencyMicros = Math.round((t1 - t0) * 1000);
      const result = new Uint8Array(plaintextBuffer);
      this.recordStats(latencyMicros, result.byteLength, false);

      return result;
    } catch (err) {
      this.stats.droppedOrCorruptFrames++;
      throw new Error('GCM authentication failed or corrupted frame payload');
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
    const totalFrames = this.stats.framesEncrypted + this.stats.framesDecrypted;
    this.stats.averageLatencyMicros = Math.round(this.latencySumMicros / totalFrames);
  }
}
