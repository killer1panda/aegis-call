/**
 * AegisCall Real-Time AudioWorklet Noise Gate & Voice Isolation Processor
 * Operates on the dedicated Web Audio rendering thread with zero UI lag.
 */
class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: 0.015, minValue: 0.0001, maxValue: 1.0 },
      { name: 'attack', defaultValue: 0.005, minValue: 0.001, maxValue: 0.1 },
      { name: 'release', defaultValue: 0.08, minValue: 0.01, maxValue: 0.5 },
      { name: 'enabled', defaultValue: 1, minValue: 0, maxValue: 1 },
    ];
  }

  constructor() {
    super();
    this.envelope = 0.0;
    this.gain = 1.0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0) return true;

    const threshold = parameters.threshold[0];
    const attack = parameters.attack[0];
    const release = parameters.release[0];
    const isEnabled = parameters.enabled[0] > 0.5;

    // Process mono or stereo channels
    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      for (let i = 0; i < inputChannel.length; i++) {
        const sample = inputChannel[i];

        if (!isEnabled) {
          // Bypass mode
          outputChannel[i] = sample;
          continue;
        }

        const absSample = Math.abs(sample);

        // Envelope follower
        if (absSample > this.envelope) {
          this.envelope += (absSample - this.envelope) * attack;
        } else {
          this.envelope += (absSample - this.envelope) * release;
        }

        // Soft-knee gain computation
        let targetGain = 0.0;
        if (this.envelope > threshold) {
          // Above threshold: open gate
          targetGain = 1.0;
        } else if (this.envelope > threshold * 0.5) {
          // Soft-knee transition zone
          const factor = (this.envelope - threshold * 0.5) / (threshold * 0.5);
          targetGain = factor * factor;
        } else {
          // Below threshold: attenuate ambient noise
          targetGain = 0.0;
        }

        // Smooth gain transitions to eliminate audio clicks
        this.gain += (targetGain - this.gain) * 0.15;

        outputChannel[i] = sample * this.gain;
      }
    }

    return true;
  }
}

registerProcessor('noise-gate-processor', NoiseGateProcessor);
