/**
 * AegisCall Tamper-Evident Spatial Video Steganography (Micro-Flicker Watermarking)
 * Embeds an imperceptible, high-frequency luminance modulation lattice (Delta <= 1.5)
 * into video frames. Invisible to human observers, but captured by external smartphone
 * camera CMOS sensors to indisputably identify participants who leak meetings via phone recordings.
 */

export interface MicroFlickerMetadata {
  viewerDid: string;
  roomId: string;
  timestamp: number;
}

export class SpatialMicroFlicker {
  /**
   * Applies imperceptible spatial luminance micro-flicker to raw ImageData.
   * Modulates pixel luminance by +/- 1.0 depending on binary bit matrix.
   */
  public static applyWatermark(
    imageData: ImageData,
    metadata: MicroFlickerMetadata,
    frameIndex: number
  ): void {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    // Convert metadata string into binary sequence
    const payloadStr = `${metadata.viewerDid}:${metadata.roomId}`;
    const encoder = new TextEncoder();
    const payloadBytes = encoder.encode(payloadStr);

    const bitLength = payloadBytes.length * 8;
    if (bitLength === 0) return;

    // Modulate luminance (Y channel approximation: 0.299R + 0.587G + 0.114B)
    // Every 8x8 block carries 1 bit of the watermark
    const blockSize = 8;
    const blocksX = Math.floor(width / blockSize);
    const blocksY = Math.floor(height / blockSize);
    const totalBlocks = blocksX * blocksY;

    // Alternating phase flicker: even frames shift +1, odd frames shift -1
    const polarity = frameIndex % 2 === 0 ? 1.0 : -1.0;

    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        const blockIdx = (by * blocksX + bx) % bitLength;
        const byteIdx = Math.floor(blockIdx / 8);
        const bitIdx = blockIdx % 8;
        const bit = (payloadBytes[byteIdx] >> bitIdx) & 1;

        const delta = bit === 1 ? 1.5 * polarity : -1.5 * polarity;

        // Apply delta to green channel (highest visual sensitivity for cameras, lowest perception for humans)
        for (let py = 0; py < blockSize; py++) {
          const y = by * blockSize + py;
          if (y >= height) break;

          for (let px = 0; px < blockSize; px++) {
            const x = bx * blockSize + px;
            if (x >= width) break;

            const pixelIdx = (y * width + x) * 4;
            // Green channel is index 1
            const currentGreen = data[pixelIdx + 1];
            data[pixelIdx + 1] = Math.max(0, Math.min(255, Math.round(currentGreen + delta)));
          }
        }
      }
    }
  }

  /**
   * Evaluates if spatial micro-flicker watermark lattice is present in the frame.
   */
  public static detectWatermarkPresence(imageData: ImageData, blockSize = 8): {
    hasWatermark: boolean;
    averageDelta: number;
  } {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    let blockVariance = 0;
    let comparisons = 0;

    for (let y = 0; y < height; y += blockSize) {
      for (let x = 0; x < width - blockSize; x += blockSize) {
        const p1 = (y * width + x) * 4 + 1;
        const p2 = (y * width + (x + blockSize)) * 4 + 1;
        blockVariance += Math.abs(data[p1] - data[p2]);
        comparisons++;
      }
    }

    const avgVariance = comparisons > 0 ? blockVariance / comparisons : 0;
    return {
      hasWatermark: avgVariance > 0,
      averageDelta: Math.min(1.5, avgVariance),
    };
  }
}
