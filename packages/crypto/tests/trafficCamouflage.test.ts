import { describe, it, expect } from 'vitest';
import {
  TrafficCamouflagePacer,
  TrafficCamouflageFilter,
  DUMMY_FRAME_MAGIC,
  DEFAULT_CAMOUFLAGE_FRAME_SIZE,
} from '../src/trafficCamouflage.js';

describe('AegisCall Constant-Rate Constant-Volume Traffic Camouflage (Anti-Traffic-Analysis)', () => {
  it('should generate synthetic dummy frames matching standard camouflage frame size', () => {
    const pacer = new TrafficCamouflagePacer(DEFAULT_CAMOUFLAGE_FRAME_SIZE, 50);
    const dummy = pacer.generateDummyFrame();

    expect(dummy.length).toBe(DEFAULT_CAMOUFLAGE_FRAME_SIZE);
    expect(dummy.slice(0, 4)).toEqual(DUMMY_FRAME_MAGIC);
  });

  it('should maintain constant frame size whether user is actively speaking or silent/muted', () => {
    const pacer = new TrafficCamouflagePacer(256, 50);

    // 1. When silent / muted (no frame provided)
    const silentPacket = pacer.paceFrame(null);
    expect(silentPacket.length).toBe(256);

    // 2. When user speaks a small audio frame (e.g. 160 bytes)
    const realShortFrame = new Uint8Array(160).fill(0x42);
    const pacedRealFrame = pacer.paceFrame(realShortFrame);
    expect(pacedRealFrame.length).toBe(256);
    expect(pacedRealFrame.slice(0, 160)).toEqual(realShortFrame);

    const stats = pacer.getStats();
    expect(stats.realFramesSent).toBe(1);
    expect(stats.dummyFramesSent).toBe(1);
    expect(stats.totalBytesTransmitted).toBe(512); // Exactly 256 * 2
  });

  it('should filter dummy packets from wire stream with zero latency', () => {
    const pacer = new TrafficCamouflagePacer(256);
    const filter = new TrafficCamouflageFilter();

    const dummyPacket = pacer.generateDummyFrame();
    expect(filter.isDummyFrame(dummyPacket)).toBe(true);

    const filteredDummy = filter.filterFrame(dummyPacket);
    expect(filteredDummy).toBeNull();
    expect(filter.getDroppedCount()).toBe(1);

    // Real encrypted frame (does not have dummy magic)
    const realFrame = new Uint8Array(256).fill(0x77);
    expect(filter.isDummyFrame(realFrame)).toBe(false);

    const passedFrame = filter.filterFrame(realFrame);
    expect(passedFrame).toEqual(realFrame);
    expect(filter.getDroppedCount()).toBe(1); // Unchanged
  });
});
