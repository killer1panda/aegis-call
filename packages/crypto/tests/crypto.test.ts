import { describe, it, expect } from 'vitest';
import {
  generateEphemeralKeyPair,
  deriveSessionKeys,
  generateSafetyNumbers,
  FrameCipher,
  DataCipher,
  FRAME_MAGIC_BYTE
} from '../src/index.js';

describe('Aegis Cryptographic Engine', () => {
  it('should generate valid X25519 ephemeral keypairs', () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();

    expect(alice.publicKey.length).toBe(32);
    expect(alice.privateKey.length).toBe(32);
    expect(alice.publicKeyHex.length).toBe(64);
    expect(bob.publicKeyHex).not.toBe(alice.publicKeyHex);
  });

  it('should compute identical symmetric session keys across peers via ECDH + HKDF', () => {
    const roomId = 'secure-room-alpha-99';
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();

    const aliceKeys = deriveSessionKeys(alice.privateKey, bob.publicKey, roomId);
    const bobKeys = deriveSessionKeys(bob.privateKey, alice.publicKey, roomId);

    expect(aliceKeys.audioKey).toEqual(bobKeys.audioKey);
    expect(aliceKeys.videoKey).toEqual(bobKeys.videoKey);
    expect(aliceKeys.dataKey).toEqual(bobKeys.dataKey);
    expect(aliceKeys.ivBase).toEqual(bobKeys.ivBase);
    expect(aliceKeys.sasEntropy).toEqual(bobKeys.sasEntropy);

    // Verify Audio and Video keys are distinct (domain separation)
    expect(aliceKeys.audioKey).not.toEqual(aliceKeys.videoKey);
  });

  it('should generate identical Safety Numbers (SAS) and emojis regardless of caller role', () => {
    const roomId = 'secure-room-gamma';
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();

    const aliceKeys = deriveSessionKeys(alice.privateKey, bob.publicKey, roomId);
    const bobKeys = deriveSessionKeys(bob.privateKey, alice.publicKey, roomId);

    const aliceSAS = generateSafetyNumbers(alice.publicKey, bob.publicKey, aliceKeys.sasEntropy);
    const bobSAS = generateSafetyNumbers(bob.publicKey, alice.publicKey, bobKeys.sasEntropy);

    expect(aliceSAS.numericCode).toBe(bobSAS.numericCode);
    expect(aliceSAS.emojis).toEqual(bobSAS.emojis);
    expect(aliceSAS.hexFingerprint).toBe(bobSAS.hexFingerprint);
    expect(aliceSAS.emojis.length).toBe(4);
  });

  it('should encrypt and decrypt WebRTC frames with AES-256-GCM', async () => {
    const roomId = 'room-stream-test';
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const aliceKeys = deriveSessionKeys(alice.privateKey, bob.publicKey, roomId);
    const bobKeys = deriveSessionKeys(bob.privateKey, alice.publicKey, roomId);

    const encryptor = new FrameCipher(aliceKeys.videoKey, aliceKeys.ivBase);
    const decryptor = new FrameCipher(bobKeys.videoKey, bobKeys.ivBase);

    const dummyVideoFrame = new TextEncoder().encode('VP8_VIDEO_KEY_FRAME_DATA_MOCK_1234567890');
    
    const encryptedFrame = await encryptor.encryptFrame(dummyVideoFrame);

    expect(encryptedFrame[0]).toBe(FRAME_MAGIC_BYTE);
    expect(encryptedFrame.length).toBeGreaterThan(dummyVideoFrame.length);

    const decryptedFrame = await decryptor.decryptFrame(encryptedFrame);
    const decryptedText = new TextDecoder().decode(decryptedFrame);

    expect(decryptedText).toBe('VP8_VIDEO_KEY_FRAME_DATA_MOCK_1234567890');
    expect(encryptor.stats.framesEncrypted).toBe(1);
    expect(decryptor.stats.framesDecrypted).toBe(1);
  });

  it('should detect and reject tampered frames', async () => {
    const roomId = 'room-tamper-test';
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const aliceKeys = deriveSessionKeys(alice.privateKey, bob.publicKey, roomId);
    const bobKeys = deriveSessionKeys(bob.privateKey, alice.publicKey, roomId);

    const encryptor = new FrameCipher(aliceKeys.audioKey, aliceKeys.ivBase);
    const decryptor = new FrameCipher(bobKeys.audioKey, bobKeys.ivBase);

    const dummyAudio = new TextEncoder().encode('OPUS_AUDIO_SAMPLE');
    const encrypted = await encryptor.encryptFrame(dummyAudio);

    // Tamper with a payload byte
    const tampered = new Uint8Array(encrypted);
    tampered[10] ^= 0xff;

    await expect(decryptor.decryptFrame(tampered)).rejects.toThrow();
    expect(decryptor.stats.droppedOrCorruptFrames).toBe(1);
  });

  it('should encrypt and decrypt DataChannel messages', async () => {
    const roomId = 'room-chat-test';
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const aliceKeys = deriveSessionKeys(alice.privateKey, bob.publicKey, roomId);
    const bobKeys = deriveSessionKeys(bob.privateKey, alice.publicKey, roomId);

    const aliceChatCipher = new DataCipher(aliceKeys.dataKey, alice.publicKeyHex.slice(0, 8));
    const bobChatCipher = new DataCipher(bobKeys.dataKey, bob.publicKeyHex.slice(0, 8));

    const originalMessage = 'Hello, this is a top-secret message transmitted over WebRTC DataChannel!';
    const encryptedPayload = await aliceChatCipher.encryptMessage(originalMessage);

    const decryptedMessage = await bobChatCipher.decryptMessage(encryptedPayload);
    expect(decryptedMessage).toBe(originalMessage);
  });
});
