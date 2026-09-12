import { describe, it, expect } from 'vitest';
import { AdaptiveBitrateController } from '../src/services/congestionController.js';

describe('Aegis AdaptiveBitrateController (ABR)', () => {
  it('should initialize in auto mode with high tier', () => {
    const abr = new AdaptiveBitrateController();
    expect(abr.getMode()).toBe('auto');
    expect(abr.getCurrentTier()).toBe('high');
    expect(abr.getTelemetry().bandwidthSavedPercent).toBe(0);
  });

  it('should dynamically step down quality under sustained network congestion', () => {
    const abr = new AdaptiveBitrateController('high');
    const tierTransitions: string[] = [];
    abr.onTierChange((tier) => tierTransitions.push(tier));

    // Sample 1: high loss, but only 1 sample -> no switch yet
    abr.evaluateNetworkSample({ rttMs: 280, packetLossPercent: 5.5, bitrateKbps: 400, fps: 12 });
    expect(abr.getCurrentTier()).toBe('high');

    // Sample 2: 2nd consecutive degraded sample -> triggers downscale to medium (720p)
    abr.evaluateNetworkSample({ rttMs: 290, packetLossPercent: 6.2, bitrateKbps: 380, fps: 10 });
    expect(abr.getCurrentTier()).toBe('medium');
    expect(abr.getTelemetry().bandwidthSavedPercent).toBe(66);

    // Two more bad samples -> triggers downscale to low (360p)
    abr.evaluateNetworkSample({ rttMs: 310, packetLossPercent: 7.0, bitrateKbps: 200, fps: 8 });
    abr.evaluateNetworkSample({ rttMs: 320, packetLossPercent: 8.5, bitrateKbps: 180, fps: 6 });
    expect(abr.getCurrentTier()).toBe('low');
    expect(abr.getTelemetry().bandwidthSavedPercent).toBe(88);

    expect(tierTransitions).toEqual(['medium', 'low']);
  });

  it('should conservatively ramp up quality when network stabilizes', () => {
    const abr = new AdaptiveBitrateController('low');
    const tierTransitions: string[] = [];
    abr.onTierChange((tier) => tierTransitions.push(tier));

    // 4 healthy samples are not enough (requires 5)
    for (let i = 0; i < 4; i++) {
      abr.evaluateNetworkSample({ rttMs: 40, packetLossPercent: 0.1, bitrateKbps: 2500, fps: 30 });
      expect(abr.getCurrentTier()).toBe('low');
    }

    // 5th healthy sample -> upgrades low -> medium
    abr.evaluateNetworkSample({ rttMs: 38, packetLossPercent: 0.0, bitrateKbps: 2600, fps: 30 });
    expect(abr.getCurrentTier()).toBe('medium');

    // 5 more healthy samples -> upgrades medium -> high
    for (let i = 0; i < 5; i++) {
      abr.evaluateNetworkSample({ rttMs: 35, packetLossPercent: 0.0, bitrateKbps: 2800, fps: 30 });
    }
    expect(abr.getCurrentTier()).toBe('high');
    expect(tierTransitions).toEqual(['medium', 'high']);
  });

  it('should respect manual override and lock tier', () => {
    const abr = new AdaptiveBitrateController('high');
    abr.setManualTier('low');

    expect(abr.getMode()).toBe('manual');
    expect(abr.getCurrentTier()).toBe('low');

    // Feed terrible conditions
    abr.evaluateNetworkSample({ rttMs: 500, packetLossPercent: 20, bitrateKbps: 50, fps: 2 });
    expect(abr.getCurrentTier()).toBe('low');

    // Feed perfect conditions
    for (let i = 0; i < 10; i++) {
      abr.evaluateNetworkSample({ rttMs: 20, packetLossPercent: 0, bitrateKbps: 5000, fps: 60 });
    }
    // Still locked to low
    expect(abr.getCurrentTier()).toBe('low');
  });
});
