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
    // DC-blocking filter states per channel (y[n] = x[n] - x[n-1] + R * y[n-1])
    this.dcPrevX = [0.0, 0.0];
    this.dcPrevY = [0.0, 0.0];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0) return true;

    const threshold = parameters.threshold[0];
    const attackTime = parameters.attack[0];
    const releaseTime = parameters.release[0];
    const isEnabled = parameters.enabled[0] > 0.5;

    // Sample-rate normalized time constants: alpha = 1 - exp(-1 / (tau * sampleRate))
    const sr = typeof sampleRate !== 'undefined' && sampleRate > 0 ? sampleRate : 48000;
    const alphaAttack = 1 - Math.exp(-1 / (Math.max(attackTime, 0.001) * sr));
    const alphaRelease = 1 - Math.exp(-1 / (Math.max(releaseTime, 0.01) * sr));
    const alphaGainSmooth = 1 - Math.exp(-1 / (0.012 * sr)); // 12ms anti-click transition

    const R = 0.995; // DC-blocking highpass coefficient (~80Hz cutoff at 48kHz)

    // Process mono or stereo channels
    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      // Ensure DC filter state exists for channel
      if (this.dcPrevX.length <= channel) {
        this.dcPrevX.push(0.0);
        this.dcPrevY.push(0.0);
      }

      let prevX = this.dcPrevX[channel];
      let prevY = this.dcPrevY[channel];

      for (let i = 0; i < inputChannel.length; i++) {
        const rawSample = inputChannel[i];

        if (!isEnabled) {
          // Bypass mode
          outputChannel[i] = rawSample;
          continue;
        }

        // Apply DC-blocking filter to remove DC offset and sub-audible mic pops
        const cleanSample = rawSample - prevX + R * prevY;
        prevX = rawSample;
        prevY = cleanSample;

        const absSample = Math.abs(cleanSample);

        // Sample-rate invariant envelope follower
        if (absSample > this.envelope) {
          this.envelope += (absSample - this.envelope) * alphaAttack;
        } else {
          this.envelope += (absSample - this.envelope) * alphaRelease;
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
        this.gain += (targetGain - this.gain) * alphaGainSmooth;

        outputChannel[i] = rawSample * this.gain;
      }

      this.dcPrevX[channel] = prevX;
      this.dcPrevY[channel] = prevY;
    }

    return true;
  }
}

registerProcessor('noise-gate-processor', NoiseGateProcessor);
