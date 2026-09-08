import { describe, it, expect } from 'vitest';
import { SFrameCipher, generateEphemeralKeyPair, deriveSessionKeys } from '../src/index.js';

describe('IETF SFrame Protocol with Key Epoch Ratcheting', () => {
  it('should encrypt and decrypt frames within epoch 0', async () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const keys = deriveSessionKeys(alice.privateKey, bob.publicKey, 'test-room');

    const enc = new SFrameCipher(keys.videoKey, keys.ivBase);
    const dec = new SFrameCipher(keys.videoKey, keys.ivBase);

    const frame = new TextEncoder().encode('RAW_VIDEO_FRAME_PAYLOAD_BYTE_STREAM');
    const encrypted = await enc.encryptFrame(frame);

    // Minimum length check
    expect(encrypted.length).toBe(6 + frame.length + 16);

    const decrypted = await dec.decryptFrame(encrypted);
    expect(new TextDecoder().decode(decrypted)).toBe('RAW_VIDEO_FRAME_PAYLOAD_BYTE_STREAM');
  });

  it('should ratchet key epochs and decrypt frames from new epoch', async () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const keys = deriveSessionKeys(alice.privateKey, bob.publicKey, 'test-room');

    const enc = new SFrameCipher(keys.videoKey, keys.ivBase);
    const dec = new SFrameCipher(keys.videoKey, keys.ivBase);

    // Initial epoch is 0
    expect(enc.getCurrentEpoch()).toBe(0);

    // Ratchet to Epoch 1
    const newEpoch = await enc.ratchetEpoch();
    expect(newEpoch).toBe(1);
    expect(enc.getCurrentEpoch()).toBe(1);

    const frame = new TextEncoder().encode('ENCRYPTED_UNDER_EPOCH_1');
    const encrypted = await enc.encryptFrame(frame);

    // Decryptor learns epoch from header and derives epoch 1 key on the fly
    const decrypted = await dec.decryptFrame(encrypted);
    expect(new TextDecoder().decode(decrypted)).toBe('ENCRYPTED_UNDER_EPOCH_1');
  });

  it('should detect and reject replayed frames', async () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const keys = deriveSessionKeys(alice.privateKey, bob.publicKey, 'test-room');

    const enc = new SFrameCipher(keys.audioKey, keys.ivBase);
    const dec = new SFrameCipher(keys.audioKey, keys.ivBase);

    const frame = new TextEncoder().encode('AUDIO_VOICE_SAMPLE');
    const encrypted = await enc.encryptFrame(frame);

    // First decryption succeeds
    const firstDec = await dec.decryptFrame(encrypted);
    expect(firstDec).toBeDefined();

    // Second decryption of identical frame should fail due to replay detection
    await expect(dec.decryptFrame(encrypted)).rejects.toThrow(/Replay attack detected/);
  });
});
