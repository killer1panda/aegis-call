import { describe, it, expect } from 'vitest';
import {
  deriveDeniableKeys,
  createDeniableMessage,
  verifyAndDecryptDeniableMessage,
  forgeDeniableMessage,
} from '../src/deniability.js';
import { generateEphemeralKeyPair, deriveSharedSecret } from '../src/keyExchange.js';

describe('Cryptographic Deniability (Signal/OTR-Style)', () => {
  it('should derive deterministic symmetric keys from Diffie-Hellman secret', () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const shared1 = deriveSharedSecret(alice.privateKey, bob.publicKey);
    const shared2 = deriveSharedSecret(bob.privateKey, alice.publicKey);

    const keys1 = deriveDeniableKeys(shared1);
    const keys2 = deriveDeniableKeys(shared2);

    expect(Buffer.from(keys1.encKey).equals(Buffer.from(keys2.encKey))).toBe(true);
    expect(Buffer.from(keys1.macKey).equals(Buffer.from(keys2.macKey))).toBe(true);
  });

  it('should encrypt, authenticate, and decrypt valid deniable messages', async () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const shared = deriveSharedSecret(alice.privateKey, bob.publicKey);

    const msg = await createDeniableMessage('Operation Deep Water at 0200 UTC', shared, 'alice-node-1');
    expect(msg.version).toBe('aegis-otr-v1');
    expect(msg.ciphertextHex.length).toBeGreaterThan(20);
    expect(msg.macHex.length).toBe(64); // SHA-256 HMAC (32 bytes = 64 hex chars)

    // Bob successfully verifies and decrypts
    const result = await verifyAndDecryptDeniableMessage(msg, shared);
    expect(result.valid).toBe(true);
    expect(result.plaintext).toBe('Operation Deep Water at 0200 UTC');
  });

  it('should detect and reject tampered ciphertext or modified metadata', async () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const shared = deriveSharedSecret(alice.privateKey, bob.publicKey);

    const msg = await createDeniableMessage('Authentic unclassified status', shared, 'alice');

    // Tamper ciphertext
    const tamperedCipher = { ...msg, ciphertextHex: 'deadbeef' + msg.ciphertextHex.slice(8) };
    const res1 = await verifyAndDecryptDeniableMessage(tamperedCipher, shared);
    expect(res1.valid).toBe(false);
    expect(res1.reason).toContain('MAC verification failed');

    // Tamper timestamp
    const tamperedTime = { ...msg, timestamp: msg.timestamp + 1000 };
    const res2 = await verifyAndDecryptDeniableMessage(tamperedTime, shared);
    expect(res2.valid).toBe(false);
    expect(res2.reason).toContain('MAC verification failed');
  });

  it('should mathematically demonstrate transcript forgeability (legal deniability)', async () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const shared = deriveSharedSecret(alice.privateKey, bob.publicKey);

    // Bob creates a forged message claiming Alice admitted something she never said
    const forgedTimestamp = 1600000000000;
    const forged = await forgeDeniableMessage(
      'I confess to leaking the classified documents.',
      shared,
      'alice',
      forgedTimestamp
    );

    // The forged message passes MAC verification and decryption flawlessly
    const verification = await verifyAndDecryptDeniableMessage(forged, shared);
    expect(verification.valid).toBe(true);
    expect(verification.plaintext).toBe('I confess to leaking the classified documents.');

    // Therefore, in a legal or third-party context, Bob CANNOT prove Alice authored any message!
  });
});
