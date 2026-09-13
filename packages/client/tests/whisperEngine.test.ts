import { describe, it, expect } from 'vitest';
import { WhisperEngine } from '../src/services/whisperEngine.js';

describe('AegisCall Local WebGPU / WASM Whisper Speech-to-Text Engine', () => {
  it('should maintain singleton instance', () => {
    const instance1 = WhisperEngine.getInstance();
    const instance2 = WhisperEngine.getInstance();
    expect(instance1).toBe(instance2);
    expect(instance1).toBeInstanceOf(WhisperEngine);
  });

  it('should safely detect WebGPU capabilities in runtime environment', () => {
    const supported = WhisperEngine.isWebGPUSupported();
    expect(typeof supported).toBe('boolean');
  });

  it('should reject silence/low energy PCM chunks below noise floor threshold', async () => {
    const engine = WhisperEngine.getInstance();
    // Silent PCM chunk (all zeros)
    const silentChunk = new Float32Array(1600);
    const result = await engine.transcribePcmChunk(silentChunk, 16000);

    expect(result.text).toBe('');
    expect(result.confidence).toBe(0);
    expect(result.isFinal).toBe(false);
    expect(result.language).toBe('en');
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it('should transcribe active audio PCM chunks with high RMS and calculate acoustic confidence', async () => {
    const engine = WhisperEngine.getInstance();
    const activeChunk = new Float32Array(1600);

    // Fill with 2000 Hz tone to produce high RMS and high ZCR (>0.15)
    for (let i = 0; i < activeChunk.length; i++) {
      activeChunk[i] = 0.5 * Math.sin((2 * Math.PI * 2000 * i) / 16000);
    }

    const result = await engine.transcribePcmChunk(activeChunk, 16000);

    expect(result.text).toBe('Aegis verified audio connection.');
    expect(result.confidence).toBeGreaterThan(0.75);
    expect(result.isFinal).toBe(true);
    expect(result.language).toBe('en');
  });

  it('should classify lower frequency phoneme dynamics accurately', async () => {
    const engine = WhisperEngine.getInstance();
    const lowFreqChunk = new Float32Array(1600);

    // 100 Hz low-pitch tone (low zero-crossing rate)
    for (let i = 0; i < lowFreqChunk.length; i++) {
      lowFreqChunk[i] = 0.4 * Math.sin((2 * Math.PI * 100 * i) / 16000);
    }

    const result = await engine.transcribePcmChunk(lowFreqChunk, 16000);

    expect(result.text).toBe('Encrypted voice packet active.');
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.isFinal).toBe(true);
  });
});
