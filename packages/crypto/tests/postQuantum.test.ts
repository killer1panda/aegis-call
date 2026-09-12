import { describe, it, expect } from 'vitest';
import {
  generateHybridKeyPair,
  encapsulateHybrid,
  decapsulateHybrid,
  HYBRID_KEY_LENGTHS,
} from '../src/postQuantum.js';
import { generateSafetyNumbers } from '../src/sas.js';

describe('Hybrid Post-Quantum Cryptography (ML-KEM-768 + X25519)', () => {
  it('should generate valid hybrid keypair with expected key lengths', () => {
    const keyPair = generateHybridKeyPair();

    expect(keyPair.publicKey.length).toBe(HYBRID_KEY_LENGTHS.publicKey); // 1216 bytes
    expect(keyPair.secretKey.length).toBe(HYBRID_KEY_LENGTHS.secretKey); // 32 bytes
    expect(keyPair.classicalPublicKey.length).toBe(HYBRID_KEY_LENGTHS.classicalPk); // 32 bytes
    expect(keyPair.postQuantumPublicKey.length).toBe(HYBRID_KEY_LENGTHS.postQuantumPk); // 1184 bytes
    expect(keyPair.publicKeyHex.length).toBe(HYBRID_KEY_LENGTHS.publicKey * 2); // 2432 hex chars
  });

  it('should perform hybrid encapsulation and decapsulation deriving identical session keys', () => {
    const aliceKeyPair = generateHybridKeyPair();
    const roomId = 'room-alpha-pqc-test-99';

    // Bob encapsulates using Alice's public key (as Uint8Array)
    const bobResult = encapsulateHybrid(aliceKeyPair.publicKey, roomId);

    expect(bobResult.cipherText.length).toBe(HYBRID_KEY_LENGTHS.cipherText); // 1120 bytes
    expect(bobResult.cipherTextHex.length).toBe(HYBRID_KEY_LENGTHS.cipherText * 2);
    expect(bobResult.sharedSecret.length).toBe(HYBRID_KEY_LENGTHS.sharedSecret); // 32 bytes

    // Alice decapsulates using the received ciphertext and her secret key
    const aliceKeys = decapsulateHybrid(bobResult.cipherText, aliceKeyPair.secretKey, roomId);

    // Verify all derived keys are identical
    expect(Buffer.from(aliceKeys.audioKey).equals(Buffer.from(bobResult.sessionKeys.audioKey))).toBe(true);
    expect(Buffer.from(aliceKeys.videoKey).equals(Buffer.from(bobResult.sessionKeys.videoKey))).toBe(true);
    expect(Buffer.from(aliceKeys.dataKey).equals(Buffer.from(bobResult.sessionKeys.dataKey))).toBe(true);
    expect(Buffer.from(aliceKeys.ivBase).equals(Buffer.from(bobResult.sessionKeys.ivBase))).toBe(true);
    expect(Buffer.from(aliceKeys.sasEntropy).equals(Buffer.from(bobResult.sessionKeys.sasEntropy))).toBe(true);

    // Verify Short Authentication String (SAS) match
    const aliceSas = generateSafetyNumbers(aliceKeyPair.classicalPublicKey, bobResult.sessionKeys.audioKey, aliceKeys.sasEntropy);
    const bobSas = generateSafetyNumbers(aliceKeyPair.classicalPublicKey, bobResult.sessionKeys.audioKey, bobResult.sessionKeys.sasEntropy);
    expect(aliceSas.numericCode).toBe(bobSas.numericCode);
    expect(aliceSas.emojis).toEqual(bobSas.emojis);
    expect(aliceSas.hexFingerprint).toBe(bobSas.hexFingerprint);
  });

  it('should support encapsulation using hex-encoded public keys and hex ciphertexts', () => {
    const bobKeyPair = generateHybridKeyPair();
    const roomId = 'room-hex-compatibility-42';

    // Alice encapsulates with Bob's hex public key
    const aliceResult = encapsulateHybrid(bobKeyPair.publicKeyHex, roomId);

    // Bob decapsulates with hex ciphertext
    const bobKeys = decapsulateHybrid(aliceResult.cipherTextHex, bobKeyPair.secretKey, roomId);

    expect(Buffer.from(bobKeys.audioKey).equals(Buffer.from(aliceResult.sessionKeys.audioKey))).toBe(true);
  });

  it('should enforce domain separation: different roomIds derive different session keys', () => {
    const recipientKeyPair = generateHybridKeyPair();

    const resultRoom1 = encapsulateHybrid(recipientKeyPair.publicKey, 'room-one');
    const resultRoom2 = encapsulateHybrid(recipientKeyPair.publicKey, 'room-two');

    // Even with the same shared secret (if identical inputs were used), HKDF salt differs
    const keysRoom1 = decapsulateHybrid(resultRoom1.cipherText, recipientKeyPair.secretKey, 'room-one');
    const keysRoom2 = decapsulateHybrid(resultRoom1.cipherText, recipientKeyPair.secretKey, 'room-two');

    expect(Buffer.from(keysRoom1.audioKey).equals(Buffer.from(keysRoom2.audioKey))).toBe(false);
    expect(Buffer.from(keysRoom1.sasEntropy).equals(Buffer.from(keysRoom2.sasEntropy))).toBe(false);
  });

  it('should reject tampered ciphertext with modified shared secret or error', () => {
    const aliceKeyPair = generateHybridKeyPair();
    const roomId = 'room-tamper-detection';

    const bobResult = encapsulateHybrid(aliceKeyPair.publicKey, roomId);

    // Tamper with the ciphertext (flip a byte)
    const tamperedCipherText = new Uint8Array(bobResult.cipherText);
    tamperedCipherText[100] ^= 0xff;

    // ML-KEM implicit rejection guarantees tampered ciphertext produces completely different shared secret
    const decapsulatedKeys = decapsulateHybrid(tamperedCipherText, aliceKeyPair.secretKey, roomId);

    expect(Buffer.from(decapsulatedKeys.audioKey).equals(Buffer.from(bobResult.sessionKeys.audioKey))).toBe(false);
  });

  it('should throw clear errors on invalid key or ciphertext lengths', () => {
    const dummyShortKey = new Uint8Array(100);
    expect(() => encapsulateHybrid(dummyShortKey, 'room-error')).toThrowError(/Invalid hybrid public key length/);

    const dummyShortCipher = new Uint8Array(500);
    const keyPair = generateHybridKeyPair();
    expect(() => decapsulateHybrid(dummyShortCipher, keyPair.secretKey, 'room-error')).toThrowError(/Invalid hybrid ciphertext length/);
  });
});
