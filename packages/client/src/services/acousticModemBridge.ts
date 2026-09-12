import { encodeAcousticSignal, decodeAcousticSignal, DEFAULT_SAMPLE_RATE } from '@aegis/crypto';

export class AcousticModemBridge {
  private static audioCtx: AudioContext | null = null;

  private static getAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass({ sampleRate: DEFAULT_SAMPLE_RATE });
    }
    return this.audioCtx;
  }

  /**
   * Modulates a binary payload (e.g. SAS token, short text, or key share) into
   * Bell 202 AFSK carrier tones and transmits them over device audio output.
   */
  public static async playAcousticPayload(payload: Uint8Array): Promise<void> {
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const pcmSamples = encodeAcousticSignal(payload, ctx.sampleRate, 300);
    const buffer = ctx.createBuffer(1, pcmSamples.length, ctx.sampleRate);
    buffer.getChannelData(0).set(pcmSamples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    return new Promise((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
  }

  /**
   * Decodes raw Float32Array microphone or PSTN audio samples into binary bytes.
   */
  public static decodeAcousticSamples(samples: Float32Array, sampleRate: number = DEFAULT_SAMPLE_RATE): Uint8Array {
    return decodeAcousticSignal(samples, sampleRate, 300);
  }
}
