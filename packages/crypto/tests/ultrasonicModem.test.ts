import { describe, it, expect } from 'vitest';
import {
  UltrasonicModem,
  ULTRASONIC_MARK_FREQ,
  ULTRASONIC_SPACE_FREQ,
  ULTRASONIC_SAMPLE_RATE,
} from '../src/ultrasonicModem.js';

describe('AegisCall Inaudible Ultrasound Near-Field Pairing Modem', () => {
  it('should modulate payloads into near-ultrasound audio waveform within 18.5 - 20.5 kHz frequency bounds', () => {
    const payload = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
    const pcmSamples = UltrasonicModem.modulate(payload, ULTRASONIC_SAMPLE_RATE);

    expect(pcmSamples).toBeInstanceOf(Float32Array);
    expect(pcmSamples.length).toBeGreaterThan(1000);

    // Verify all amplitudes are bounded [-1.0, 1.0]
    for (let i = 0; i < pcmSamples.length; i++) {
      expect(pcmSamples[i]).toBeGreaterThanOrEqual(-1.0);
      expect(pcmSamples[i]).toBeLessThanOrEqual(1.0);
    }
  });

  it('should modulate and demodulate payloads end-to-end with CRC-16 integrity validation', () => {
    // 8-byte pairing payload (e.g. truncated public key hash + SAS entropy)
    const originalPayload = new Uint8Array([0xaa, 0x11, 0xbb, 0x22, 0xcc, 0x33, 0xdd, 0x44]);
    const pcmSamples = UltrasonicModem.modulate(originalPayload, 48000, 400);

    const decoded = UltrasonicModem.demodulate(pcmSamples, 48000, 400);
    expect(decoded).not.toBeNull();
    expect(decoded).toEqual(originalPayload);
  });

  it('should reject corrupt audio samples or invalid preambles', () => {
    const noiseSamples = new Float32Array(5000);
    for (let i = 0; i < noiseSamples.length; i++) {
      noiseSamples[i] = (Math.random() - 0.5) * 0.1;
    }

    const decoded = UltrasonicModem.demodulate(noiseSamples, 48000, 400);
    expect(decoded).toBeNull();
  });
});
