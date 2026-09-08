import { describe, it, expect } from 'vitest';
import { FileCipher, generateEphemeralKeyPair, deriveSessionKeys } from '../src/index.js';

describe('End-to-End Encrypted FileCipher', () => {
  it('should split, encrypt, decrypt, and reassemble files with SHA-256 integrity verification', async () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const keys = deriveSessionKeys(alice.privateKey, bob.publicKey, 'test-room');

    const aliceCipher = new FileCipher(keys.dataKey);
    const bobCipher = new FileCipher(keys.dataKey);

    // Create a 200KB mock file payload to test multi-chunk splitting (exceeds 64KB chunk size)
    const fileBytes = new Uint8Array(200 * 1024);
    for (let i = 0; i < fileBytes.length; i++) {
      fileBytes[i] = i % 256;
    }

    const { metadata, chunks } = await aliceCipher.prepareFile(fileBytes, 'confidential-report.pdf');

    expect(metadata.totalChunks).toBe(4); // 200KB / 64KB = 4 chunks
    expect(chunks.length).toBe(4);

    // Encrypt each chunk as Alice
    const encryptedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const encChunk = await aliceCipher.encryptChunk(metadata.fileId, i, metadata.totalChunks, chunks[i]);
      encryptedChunks.push(encChunk);
    }

    // Decrypt each chunk as Bob
    const decryptedChunks = [];
    for (const encChunk of encryptedChunks) {
      const dec = await bobCipher.decryptChunk(encChunk);
      decryptedChunks.push(dec);
    }

    // Reassemble and verify SHA-256
    const reassembled = bobCipher.verifyAndReassemble(decryptedChunks, metadata.sha256Checksum);
    expect(reassembled.length).toBe(fileBytes.length);
    expect(reassembled).toEqual(fileBytes);
  });

  it('should fail if any chunk has been corrupted or tampered with', async () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const keys = deriveSessionKeys(alice.privateKey, bob.publicKey, 'test-room');

    const aliceCipher = new FileCipher(keys.dataKey);
    const bobCipher = new FileCipher(keys.dataKey);

    const smallFile = new TextEncoder().encode('Secret credentials payload');
    const { metadata, chunks } = await aliceCipher.prepareFile(smallFile, 'keys.txt');

    const encryptedChunk = await aliceCipher.encryptChunk(metadata.fileId, 0, 1, chunks[0]);

    // Tamper with ciphertext
    const tamperedHex = encryptedChunk.ciphertextHex.slice(0, -4) + 'ffff';
    const tamperedChunk = { ...encryptedChunk, ciphertextHex: tamperedHex };

    await expect(bobCipher.decryptChunk(tamperedChunk)).rejects.toThrow();
  });
});
