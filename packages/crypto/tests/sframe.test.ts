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

  it('should quantize audio packets to constant-size 128-byte block increments (RFC 9605) and restore original frames', async () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const keys = deriveSessionKeys(alice.privateKey, bob.publicKey, 'test-room');

    const enc = new SFrameCipher(keys.audioKey, keys.ivBase, 128);
    const dec = new SFrameCipher(keys.audioKey, keys.ivBase, 128);

    // Test a 45-byte Opus audio frame (variable bitrate)
    const rawAudio45 = new Uint8Array(45);
    for (let i = 0; i < 45; i++) rawAudio45[i] = (i * 7) % 256;

    const enc45 = await enc.encryptFrame(rawAudio45);
    // Wire length: 6B SFrame header + 128B padded ciphertext + 16B GCM tag = 150B
    expect(enc45.length).toBe(6 + 128 + 16);

    const dec45 = await dec.decryptFrame(enc45);
    expect(dec45.length).toBe(45);
    expect(dec45).toEqual(rawAudio45);

    // Test an 80-byte Opus audio frame (different phonetic complexity)
    const rawAudio80 = new Uint8Array(80);
    for (let i = 0; i < 80; i++) rawAudio80[i] = (i * 11) % 256;

    const enc80 = await enc.encryptFrame(rawAudio80);
    // Both 45B and 80B frames quantize to the exact same 150B wire size!
    expect(enc80.length).toBe(6 + 128 + 16);

    const dec80 = await dec.decryptFrame(enc80);
    expect(dec80.length).toBe(80);
    expect(dec80).toEqual(rawAudio80);
  });
});
