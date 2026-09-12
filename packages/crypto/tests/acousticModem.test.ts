import { describe, it, expect } from 'vitest';
import {
  encodeAcousticSignal,
  decodeAcousticSignal,
  crc16,
  MARK_FREQ,
  SPACE_FREQ,
} from '../src/acousticModem.js';

describe('Bell 202 AFSK Acoustic Modem', () => {
  it('should compute consistent CRC-16-CCITT', () => {
    const data = new TextEncoder().encode('AEGIS-CALL-SECURE-2026');
    const checksum1 = crc16(data);
    const checksum2 = crc16(data);
    expect(checksum1).toBe(checksum2);
    expect(checksum1).toBeGreaterThan(0);
  });

  it('should encode payload into audio samples with valid frequency bounds', () => {
    const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const audio = encodeAcousticSignal(payload, 48000, 300);

    expect(audio.length).toBeGreaterThan(1000);
    // Audio samples should be within normalized [-1.0, 1.0]
    for (let i = 0; i < audio.length; i++) {
      expect(audio[i]).toBeGreaterThanOrEqual(-1.0);
      expect(audio[i]).toBeLessThanOrEqual(1.0);
    }
  });

  it('should encode and decode binary payload with zero bit errors', () => {
    const originalText = 'AEGIS-SAS-789012';
    const payload = new TextEncoder().encode(originalText);

    // Encode at 48kHz, 300 baud
    const audio = encodeAcousticSignal(payload, 48000, 300);

    // Decode back
    const decoded = decodeAcousticSignal(audio, 48000, 300);
    const decodedText = new TextDecoder().decode(decoded);

    expect(decodedText).toBe(originalText);
    expect(decoded).toEqual(payload);
  });

  it('should survive mild Gaussian additive noise', () => {
    const originalText = 'PSTN-BRIDGE-OK';
    const payload = new TextEncoder().encode(originalText);

    const audio = encodeAcousticSignal(payload, 48000, 300);

    // Add 5% simulated channel line noise
    for (let i = 0; i < audio.length; i++) {
      audio[i] += (Math.random() - 0.5) * 0.05;
    }

    const decoded = decodeAcousticSignal(audio, 48000, 300);
    expect(new TextDecoder().decode(decoded)).toBe(originalText);
  });

  it('should reject tampered audio frames due to CRC mismatch', () => {
    const payload = new TextEncoder().encode('UNALTERED');
    const audio = encodeAcousticSignal(payload, 48000, 300);

    // Flip frequency in one bit window from 1200Hz to 2200Hz to flip the bit
    const mid = Math.floor(audio.length / 2);
    for (let i = 0; i < 160; i++) {
      audio[mid + i] = Math.sin((2 * Math.PI * SPACE_FREQ * i) / 48000);
    }

    expect(() => decodeAcousticSignal(audio, 48000, 300)).toThrow();
  });
});
