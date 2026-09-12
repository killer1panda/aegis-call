import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

export const CHUNK_SIZE_BYTES = 64 * 1024; // 64 KB chunk size for WebRTC DataChannel

export interface FileMetadata {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  totalChunks: number;
  sha256Checksum: string;
}

export interface EncryptedFileChunk {
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
  ivHex: string;
  ciphertextHex: string;
}

export class FileCipher {
  private cryptoKey: CryptoKey | null = null;
  private rawKey: Uint8Array;

  constructor(key: Uint8Array) {
    this.rawKey = key;
  }

  private async getKey(): Promise<CryptoKey> {
    if (!this.cryptoKey) {
      this.cryptoKey = await globalThis.crypto.subtle.importKey(
        'raw',
        this.rawKey as unknown as BufferSource,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
    }
    return this.cryptoKey;
  }

  /**
   * Prepares and hashes a file for chunked encrypted transmission.
   */
  public async prepareFile(
    fileBuffer: Uint8Array,
    name: string,
    mimeType: string = 'application/octet-stream'
  ): Promise<{ metadata: FileMetadata; chunks: Uint8Array[] }> {
    const fileId = `file-${Math.random().toString(36).substring(2, 10)}`;
    const checksum = bytesToHex(sha256(fileBuffer));
    const totalChunks = Math.ceil(fileBuffer.byteLength / CHUNK_SIZE_BYTES) || 1;

    const chunks: Uint8Array[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE_BYTES;
      const end = Math.min(fileBuffer.byteLength, start + CHUNK_SIZE_BYTES);
      chunks.push(fileBuffer.slice(start, end));
    }

    const metadata: FileMetadata = {
      fileId,
      name,
      size: fileBuffer.byteLength,
      mimeType,
      totalChunks,
      sha256Checksum: checksum,
    };

    return { metadata, chunks };
  }

  /**
   * Generates file transmission metadata for streaming slice-by-slice transmission
   * without requiring the entire file to be buffered in memory.
   */
  public prepareFileMetadata(
    fileSize: number,
    name: string,
    mimeType: string = 'application/octet-stream',
    checksum: string
  ): FileMetadata {
    const fileId = `file-${Math.random().toString(36).substring(2, 10)}`;
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE_BYTES) || 1;
    return {
      fileId,
      name,
      size: fileSize,
      mimeType,
      totalChunks,
      sha256Checksum: checksum,
    };
  }

  /**
   * Encrypts a single file chunk using AES-256-GCM.
   */
  public async encryptChunk(
    fileId: string,
    chunkIndex: number,
    totalChunks: number,
    chunkData: Uint8Array
  ): Promise<EncryptedFileChunk> {
    const key = await this.getKey();
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

    const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
      },
      key,
      chunkData as unknown as BufferSource
    );

    return {
      fileId,
      chunkIndex,
      totalChunks,
      ivHex: bytesToHex(iv),
      ciphertextHex: bytesToHex(new Uint8Array(ciphertextBuffer)),
    };
  }

  /**
   * Decrypts a single file chunk.
   */
  public async decryptChunk(chunk: EncryptedFileChunk): Promise<Uint8Array> {
    const key = await this.getKey();
    const iv = hexToBytes(chunk.ivHex);
    const ciphertext = hexToBytes(chunk.ciphertextHex);

    const plaintextBuffer = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
      },
      key,
      ciphertext as unknown as BufferSource
    );

    return new Uint8Array(plaintextBuffer);
  }

  /**
   * Reassembles decrypted chunks and verifies integrity against the SHA-256 checksum.
   */
  public verifyAndReassemble(chunks: Uint8Array[], expectedChecksum: string): Uint8Array {
    let totalLength = 0;
    for (const c of chunks) {
      totalLength += c.byteLength;
    }

    const reassembled = new Uint8Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      reassembled.set(c, offset);
      offset += c.byteLength;
    }

    const actualChecksum = bytesToHex(sha256(reassembled));
    if (actualChecksum !== expectedChecksum) {
      throw new Error(
        `File integrity check failed! Expected ${expectedChecksum}, computed ${actualChecksum}`
      );
    }

    return reassembled;
  }
}

/**
 * Streams a Blob or File in chunks using Web Streams API and calculates
 * its SHA-256 checksum with O(1) heap memory consumption.
 */
export async function computeBlobChecksum(blob: Blob): Promise<string> {
  const hash = sha256.create();
  if (typeof (blob as any).stream === 'function') {
    const stream = (blob as any).stream();
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        hash.update(value);
      }
    }
  } else {
    // Fallback for environments lacking Blob.stream()
    const buffer = await blob.arrayBuffer();
    hash.update(new Uint8Array(buffer));
  }

  return bytesToHex(hash.digest());
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

