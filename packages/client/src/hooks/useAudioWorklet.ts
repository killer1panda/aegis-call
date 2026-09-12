import { useEffect, useRef, useState, useCallback } from 'react';

const WORKLET_CODE = `
class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: 0.015, minValue: 0.0001, maxValue: 1.0 },
      { name: 'attack', defaultValue: 0.005, minValue: 0.001, maxValue: 0.1 },
      { name: 'release', defaultValue: 0.08, minValue: 0.01, maxValue: 0.5 },
      { name: 'enabled', defaultValue: 1, minValue: 0, maxValue: 1 },
      { name: 'filterMode', defaultValue: 2, minValue: 0, maxValue: 2 }, // 0: bypass, 1: soft-knee, 2: spectral
      { name: 'voiceMaskEnabled', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'pitchShiftRatio', defaultValue: 0.82, minValue: 0.5, maxValue: 1.5 },
    ];
  }

  constructor() {
    super();
    this.envelope = 0.0;
    this.gain = 1.0;
    this.noiseFloor = 0.005;
    this.adaptationRate = 0.01;
    this.vadActive = false;
    this.reportCounter = 0;

    // Bio-acoustic deepfake & synthetic voice detection state
    this.prevSample = 0.0;
    this.prevSample2 = 0.0;
    this.lastZeroCrossingIndex = 0;
    this.sampleCount = 0;
    this.periodLengths = [];
    this.highFreqEnergyAccum = 0.0;
    this.totalEnergyAccum = 0.0;
    this.authenticityScore = 98.0; // Baseline 98%

    // Acoustic Mask circular pitch buffer
    this.pitchBufferSize = 4096;
    this.pitchWindowSize = 2048;
    this.pitchBuffer = new Float32Array(this.pitchBufferSize);
    this.pitchWritePtr = 0;
    this.pitchOffset1 = 0.0;
    this.pitchOffset2 = this.pitchWindowSize / 2;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0) return true;

    const threshold = parameters.threshold[0];
    const attack = parameters.attack[0];
    const release = parameters.release[0];
    const isEnabled = parameters.enabled[0] > 0.5;
    const mode = Math.round(parameters.filterMode[0]);
    const voiceMask = parameters.voiceMaskEnabled ? parameters.voiceMaskEnabled[0] > 0.5 : false;
    const pitchRatio = parameters.pitchShiftRatio ? parameters.pitchShiftRatio[0] : 0.82;

    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      for (let i = 0; i < inputChannel.length; i++) {
        const sample = inputChannel[i];

        // Bio-Acoustic Analysis:
        // High-pass difference filter y[n] = s[n] - 2*s[n-1] + s[n-2] (highlights > 10-12kHz)
        const hf = sample - 2 * this.prevSample + this.prevSample2;
        this.highFreqEnergyAccum += hf * hf;
        this.totalEnergyAccum += sample * sample;

        // Zero-crossing detection for vocal fold periodicity & micro-jitter
        if ((this.prevSample <= 0 && sample > 0) || (this.prevSample >= 0 && sample < 0)) {
          const period = this.sampleCount - this.lastZeroCrossingIndex;
          if (period > 4 && period < 400) { // Valid human voice pitch periods
            this.periodLengths.push(period);
            if (this.periodLengths.length > 64) {
              this.periodLengths.shift();
            }
          }
          this.lastZeroCrossingIndex = this.sampleCount;
        }

        this.prevSample2 = this.prevSample;
        this.prevSample = sample;
        this.sampleCount++;

        if (!isEnabled || mode === 0) {
          outputChannel[i] = sample;
          continue;
        }

        const absSample = Math.abs(sample);
        if (absSample > this.envelope) {
          this.envelope += (absSample - this.envelope) * attack;
        } else {
          this.envelope += (absSample - this.envelope) * release;
        }

        // Voice Activity Detection & Adaptive Noise Floor
        this.vadActive = this.envelope > (this.noiseFloor + threshold);
        if (!this.vadActive) {
          this.noiseFloor = (1 - this.adaptationRate) * this.noiseFloor + this.adaptationRate * absSample;
        }

        let targetGain = 0.0;
        if (mode === 2) {
          // Spectral subtraction mode
          const snr = this.envelope / Math.max(0.0001, this.noiseFloor);
          if (snr < 1.2) {
            targetGain = 0.05;
          } else if (snr < 2.5) {
            targetGain = Math.pow((snr - 1.2) / 1.3, 1.5);
          } else {
            targetGain = 1.0;
          }
        } else {
          // Soft-knee mode
          if (this.envelope > threshold) {
            targetGain = 1.0;
          } else if (this.envelope > threshold * 0.5) {
            const factor = (this.envelope - threshold * 0.5) / (threshold * 0.5);
            targetGain = factor * factor;
          } else {
            targetGain = 0.0;
          }
        }

        this.gain += (targetGain - this.gain) * 0.15;
        let s = sample * this.gain;

        if (voiceMask) {
          this.pitchBuffer[this.pitchWritePtr] = s;

          const r1 = (this.pitchWritePtr - Math.floor(this.pitchOffset1) + this.pitchBufferSize) % this.pitchBufferSize;
          const r2 = (this.pitchWritePtr - Math.floor(this.pitchOffset2) + this.pitchBufferSize) % this.pitchBufferSize;

          const halfWin = this.pitchWindowSize / 2;
          const w1 = 1.0 - Math.abs(this.pitchOffset1 - halfWin) / halfWin;
          const w2 = 1.0 - w1;

          s = w1 * this.pitchBuffer[r1] + w2 * this.pitchBuffer[r2];

          const delta = 1.0 - pitchRatio;
          this.pitchOffset1 = (this.pitchOffset1 + delta + this.pitchWindowSize) % this.pitchWindowSize;
          this.pitchOffset2 = (this.pitchOffset2 + delta + this.pitchWindowSize) % this.pitchWindowSize;

          this.pitchWritePtr = (this.pitchWritePtr + 1) % this.pitchBufferSize;
        }

        outputChannel[i] = s;
      }
    }

    this.reportCounter++;
    if (this.reportCounter >= 30) {
      this.reportCounter = 0;

      // Compute acoustic authenticity score during active speech
      if (this.vadActive && this.totalEnergyAccum > 0.001) {
        const hfRatio = this.highFreqEnergyAccum / Math.max(0.00001, this.totalEnergyAccum);

        let jitterCoeff = 0.05;
        if (this.periodLengths.length >= 16) {
          const meanPeriod = this.periodLengths.reduce((a, b) => a + b, 0) / this.periodLengths.length;
          let variance = 0;
          for (let p of this.periodLengths) {
            variance += (p - meanPeriod) * (p - meanPeriod);
          }
          const stdDev = Math.sqrt(variance / this.periodLengths.length);
          jitterCoeff = stdDev / Math.max(1, meanPeriod);
        }

        let targetScore = 97.0;
        if (hfRatio < 0.005) {
          targetScore -= 45.0; // Sharp vocoder cutoff penalty
        } else if (hfRatio < 0.02) {
          targetScore -= 20.0;
        }

        if (jitterCoeff < 0.015) {
          targetScore -= 30.0; // Robotic pitch
        } else if (jitterCoeff > 0.45) {
          targetScore -= 25.0; // Phase jitter
        }

        targetScore = Math.max(15.0, Math.min(99.0, targetScore));
        this.authenticityScore = 0.7 * this.authenticityScore + 0.3 * targetScore;
      } else {
        this.authenticityScore = 0.95 * this.authenticityScore + 0.05 * 98.0;
      }

      this.highFreqEnergyAccum = 0.0;
      this.totalEnergyAccum = 0.0;

      this.port.postMessage({
        type: 'vad-telemetry',
        vadActive: this.vadActive,
        noiseFloorDb: Math.round(20 * Math.log10(Math.max(0.00001, this.noiseFloor))),
        acousticAuthenticityScore: Math.round(this.authenticityScore),
      });
    }

    return true;
  }
}
registerProcessor('noise-gate-processor', NoiseGateProcessor);
`;

export function useAudioWorklet(rawStream: MediaStream | null) {
  const [isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled] = useState(true);
  const [isVoiceMaskEnabled, setIsVoiceMaskEnabled] = useState(false);
  const [isVadActive, setIsVadActive] = useState(false);
  const [estimatedNoiseFloorDb, setEstimatedNoiseFloorDb] = useState(-48);
  const [acousticAuthenticityScore, setAcousticAuthenticityScore] = useState(98);
  const [processedStream, setProcessedStream] = useState<MediaStream | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const destinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  useEffect(() => {
    if (!rawStream || rawStream.getAudioTracks().length === 0) {
      setProcessedStream(null);
      return;
    }

    let isMounted = true;

    const initAudioPipeline = async () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;

        // Load AudioWorklet from Blob URL (bulletproof cross-origin & bundling)
        const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);

        await ctx.audioWorklet.addModule(blobUrl);
        URL.revokeObjectURL(blobUrl);

        if (!isMounted) return;

        const source = ctx.createMediaStreamSource(rawStream);
        sourceNodeRef.current = source;

        const workletNode = new AudioWorkletNode(ctx, 'noise-gate-processor');
        workletNodeRef.current = workletNode;

        workletNode.port.onmessage = (event) => {
          if (event.data?.type === 'vad-telemetry') {
            setIsVadActive(event.data.vadActive);
            if (typeof event.data.noiseFloorDb === 'number') {
              setEstimatedNoiseFloorDb(event.data.noiseFloorDb);
            }
            if (typeof event.data.acousticAuthenticityScore === 'number') {
              setAcousticAuthenticityScore(event.data.acousticAuthenticityScore);
            }
          }
        };

        const dest = ctx.createMediaStreamDestination();
        destinationNodeRef.current = dest;

        // Wire: Mic Source -> Noise Gate Worklet -> Destination
        source.connect(workletNode);
        workletNode.connect(dest);

        // Combine processed audio track with any existing video tracks from rawStream
        const processedAudioTrack = dest.stream.getAudioTracks()[0];
        const outputTracks = [processedAudioTrack];
        const videoTrack = rawStream.getVideoTracks()[0];
        if (videoTrack) outputTracks.push(videoTrack);

        const cleanStream = new MediaStream(outputTracks);
        setProcessedStream(cleanStream);
      } catch (err) {
        console.warn('AudioWorklet initialization fallback to raw stream:', err);
        setProcessedStream(rawStream);
      }
    };

    initAudioPipeline();

    return () => {
      isMounted = false;
      if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
      if (workletNodeRef.current) workletNodeRef.current.disconnect();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [rawStream]);

  const ensureAudioResumed = useCallback(async () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch (err) {
        console.warn('Could not resume AudioContext:', err);
      }
    }
  }, []);

  // Guarantee AudioContext unpauses on any user interaction (click, touch, key)
  useEffect(() => {
    const handleUserGesture = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    };
    window.addEventListener('click', handleUserGesture, { passive: true });
    window.addEventListener('touchstart', handleUserGesture, { passive: true });
    window.addEventListener('keydown', handleUserGesture, { passive: true });
    return () => {
      window.removeEventListener('click', handleUserGesture);
      window.removeEventListener('touchstart', handleUserGesture);
      window.removeEventListener('keydown', handleUserGesture);
    };
  }, []);

  const toggleNoiseSuppression = useCallback(() => {
    setIsNoiseSuppressionEnabled((prev) => {
      const next = !prev;
      if (workletNodeRef.current) {
        const param = workletNodeRef.current.parameters.get('enabled');
        if (param) param.setValueAtTime(next ? 1 : 0, audioContextRef.current?.currentTime || 0);
      }
      return next;
    });
  }, []);

  const toggleVoiceMask = useCallback(() => {
    setIsVoiceMaskEnabled((prev) => {
      const next = !prev;
      if (workletNodeRef.current) {
        const param = workletNodeRef.current.parameters.get('voiceMaskEnabled');
        if (param) param.setValueAtTime(next ? 1 : 0, audioContextRef.current?.currentTime || 0);
      }
      return next;
    });
  }, []);

  return {
    processedStream: processedStream || rawStream,
    isNoiseSuppressionEnabled,
    toggleNoiseSuppression,
    isVoiceMaskEnabled,
    toggleVoiceMask,
    isVadActive,
    estimatedNoiseFloorDb,
    acousticAuthenticityScore,
    ensureAudioResumed,
  };
}

