import { useEffect, useRef, useState, useCallback } from 'react';

const WORKLET_CODE = `
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

    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      for (let i = 0; i < inputChannel.length; i++) {
        const sample = inputChannel[i];

        if (!isEnabled) {
          outputChannel[i] = sample;
          continue;
        }

        const absSample = Math.abs(sample);
        if (absSample > this.envelope) {
          this.envelope += (absSample - this.envelope) * attack;
        } else {
          this.envelope += (absSample - this.envelope) * release;
        }

        let targetGain = 0.0;
        if (this.envelope > threshold) {
          targetGain = 1.0;
        } else if (this.envelope > threshold * 0.5) {
          const factor = (this.envelope - threshold * 0.5) / (threshold * 0.5);
          targetGain = factor * factor;
        } else {
          targetGain = 0.0;
        }

        this.gain += (targetGain - this.gain) * 0.15;
        outputChannel[i] = sample * this.gain;
      }
    }

    return true;
  }
}
registerProcessor('noise-gate-processor', NoiseGateProcessor);
`;

export function useAudioWorklet(rawStream: MediaStream | null) {
  const [isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled] = useState(true);
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

  return {
    processedStream: processedStream || rawStream,
    isNoiseSuppressionEnabled,
    toggleNoiseSuppression,
  };
}
