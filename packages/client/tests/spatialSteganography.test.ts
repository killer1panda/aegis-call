import { describe, it, expect } from 'vitest';
import { SpatialMicroFlicker } from '../src/services/spatialSteganography.js';

describe('AegisCall Tamper-Evident Spatial Video Steganography', () => {
  it('should apply imperceptible luminance micro-flicker watermark lattice to image data', () => {
    const width = 64;
    const height = 64;
    const buffer = new Uint8ClampedArray(width * height * 4);
    buffer.fill(128); // Mid-gray image

    const imageData = {
      width,
      height,
      data: buffer,
    } as unknown as ImageData;

    const initialGreen = buffer[1]; // Green channel of first pixel
    expect(initialGreen).toBe(128);

    SpatialMicroFlicker.applyWatermark(
      imageData,
      {
        viewerDid: 'did:key:z6MkhaXgBZDvotDkL5257faiz48Z8xG855C4U9p',
        roomId: 'top-secret-briefing',
        timestamp: Date.now(),
      },
      0 // Frame index
    );

    // Verify micro-delta was applied within bounds [-2, +2]
    const modifiedGreen = buffer[1];
    expect(Math.abs(modifiedGreen - initialGreen)).toBeLessThanOrEqual(2);
  });

  it('should detect presence of spatial micro-flicker watermark in modulated frames', () => {
    const width = 64;
    const height = 64;
    const buffer = new Uint8ClampedArray(width * height * 4);
    buffer.fill(128);

    const imageData = {
      width,
      height,
      data: buffer,
    } as unknown as ImageData;

    SpatialMicroFlicker.applyWatermark(
      imageData,
      {
        viewerDid: 'did:key:zAlice',
        roomId: 'room-1',
        timestamp: Date.now(),
      },
      1
    );

    const detection = SpatialMicroFlicker.detectWatermarkPresence(imageData);
    expect(detection.hasWatermark).toBe(true);
    expect(detection.averageDelta).toBeGreaterThan(0);
  });
});
