export type SimulcastTier = 'high' | 'medium' | 'low';
export type ABRMode = 'auto' | 'manual';

export interface NetworkHealthSample {
  rttMs: number;
  packetLossPercent: number;
  bitrateKbps: number;
  fps: number;
}

export interface ABRTelemetry {
  mode: ABRMode;
  currentTier: SimulcastTier;
  effectiveResolution: string;
  consecutiveHealthyCount: number;
  consecutiveDegradedCount: number;
  bandwidthSavedPercent: number;
  lastAdaptationReason: string | null;
}

export type TierChangeListener = (newTier: SimulcastTier, reason: string) => void;

/**
 * Enterprise Adaptive Bitrate (ABR) Controller & Congestion Control Manager.
 * Implements a hysteretic state machine evaluating real-time RTCP loss fraction,
 * round-trip time (RTT), and throughput to dynamically adapt the Blind SFU
 * encrypted simulcast layer.
 */
export class AdaptiveBitrateController {
  private mode: ABRMode = 'auto';
  private currentTier: SimulcastTier = 'high';
  private consecutiveHealthyCount = 0;
  private consecutiveDegradedCount = 0;
  private lastAdaptationReason: string | null = null;
  private tierListeners: Set<TierChangeListener> = new Set();

  constructor(initialTier: SimulcastTier = 'high') {
    this.currentTier = initialTier;
  }

  public setMode(mode: ABRMode): void {
    this.mode = mode;
    if (mode === 'auto') {
      this.consecutiveHealthyCount = 0;
      this.consecutiveDegradedCount = 0;
    }
  }

  public getMode(): ABRMode {
    return this.mode;
  }

  public getCurrentTier(): SimulcastTier {
    return this.currentTier;
  }

  public setManualTier(tier: SimulcastTier): void {
    this.mode = 'manual';
    if (this.currentTier !== tier) {
      const prev = this.currentTier;
      this.currentTier = tier;
      this.lastAdaptationReason = `Manual user override: ${prev.toUpperCase()} -> ${tier.toUpperCase()}`;
      this.notifyListeners(tier, this.lastAdaptationReason);
    }
  }

  /**
   * Evaluates network telemetry and performs hysteretic layer switching if in 'auto' mode.
   */
  public evaluateNetworkSample(sample: NetworkHealthSample): SimulcastTier {
    if (this.mode === 'manual') {
      return this.currentTier;
    }

    const { rttMs, packetLossPercent, fps } = sample;

    // Detection of severe or moderate network congestion
    const isDegraded = packetLossPercent > 3.5 || rttMs > 220 || (fps > 0 && fps < 15);
    const isHealthy = packetLossPercent < 0.8 && rttMs < 110 && (fps === 0 || fps >= 24);

    if (isDegraded) {
      this.consecutiveDegradedCount++;
      this.consecutiveHealthyCount = 0;

      // Swift downgrade (2 consecutive bad samples)
      if (this.consecutiveDegradedCount >= 2) {
        this.consecutiveDegradedCount = 0;
        if (this.currentTier === 'high') {
          this.stepTier('medium', `Congestion detected (loss: ${packetLossPercent}%, RTT: ${rttMs}ms)`);
        } else if (this.currentTier === 'medium') {
          this.stepTier('low', `Severe packet loss/latency (loss: ${packetLossPercent}%, RTT: ${rttMs}ms)`);
        }
      }
    } else if (isHealthy) {
      this.consecutiveHealthyCount++;
      this.consecutiveDegradedCount = 0;

      // Conservative upgrade (5 consecutive stable samples)
      if (this.consecutiveHealthyCount >= 5) {
        this.consecutiveHealthyCount = 0;
        if (this.currentTier === 'low') {
          this.stepTier('medium', `Network stabilized (loss: ${packetLossPercent}%, RTT: ${rttMs}ms)`);
        } else if (this.currentTier === 'medium') {
          this.stepTier('high', `Optimal bandwidth confirmed (loss: ${packetLossPercent}%, RTT: ${rttMs}ms)`);
        }
      }
    } else {
      // Jitter or borderline: decay counters
      if (this.consecutiveHealthyCount > 0) this.consecutiveHealthyCount--;
      if (this.consecutiveDegradedCount > 0) this.consecutiveDegradedCount--;
    }

    return this.currentTier;
  }

  public onTierChange(listener: TierChangeListener): () => void {
    this.tierListeners.add(listener);
    return () => this.tierListeners.delete(listener);
  }

  public getTelemetry(): ABRTelemetry {
    let saved = 0;
    let resolution = '1080p Full HD';
    if (this.currentTier === 'medium') {
      saved = 66;
      resolution = '720p HD';
    } else if (this.currentTier === 'low') {
      saved = 88;
      resolution = '360p Mobile SD';
    }

    return {
      mode: this.mode,
      currentTier: this.currentTier,
      effectiveResolution: resolution,
      consecutiveHealthyCount: this.consecutiveHealthyCount,
      consecutiveDegradedCount: this.consecutiveDegradedCount,
      bandwidthSavedPercent: saved,
      lastAdaptationReason: this.lastAdaptationReason,
    };
  }

  private stepTier(nextTier: SimulcastTier, reason: string): void {
    if (this.currentTier !== nextTier) {
      this.currentTier = nextTier;
      this.lastAdaptationReason = reason;
      this.notifyListeners(nextTier, reason);
    }
  }

  private notifyListeners(tier: SimulcastTier, reason: string): void {
    for (const listener of this.tierListeners) {
      try {
        listener(tier, reason);
      } catch (err) {
        console.error('[AdaptiveBitrateController] Listener error:', err);
      }
    }
  }
}
