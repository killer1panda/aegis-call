import { describe, it, expect } from 'vitest';
import {
  ChromaticSignalingTransceiver,
  CHROMATIC_PALETTE,
} from '../src/services/chromaticSignaling.js';

describe('AegisCall High-Speed Dynamic Color-Stream Air-Gapped Signaling Transceiver', () => {
  it('should define 8 high-contrast primary/secondary colors for 3-bit mapping', () => {
    expect(CHROMATIC_PALETTE).toHaveLength(8);
    // Ensure all entries are unique hex strings
    const set = new Set(CHROMATIC_PALETTE);
    expect(set.size).toBe(8);
  });

  it('should encode binary data into a 2D chromatic color grid and decode back faithfully', () => {
    // 12-byte payload (e.g. truncated SDP offer or public key hash)
    const originalPayload = new Uint8Array([
      0x41, 0x65, 0x67, 0x69, 0x73, 0x2d, 0x43, 0x61, 0x6c, 0x6c, 0x21, 0x00,
    ]);

    const grid = ChromaticSignalingTransceiver.encodeToGrid(originalPayload, 8);
    expect(grid.length).toBe(8);
    expect(grid[0].length).toBe(8);

    // Verify all cells in grid contain valid palette colors
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        expect(CHROMATIC_PALETTE).toContain(grid[r][c]);
      }
    }

    // Decode grid back to binary
    const decoded = ChromaticSignalingTransceiver.decodeFromGrid(grid, originalPayload.length);
    expect(decoded).toEqual(originalPayload);
    expect(new TextDecoder().decode(decoded.slice(0, 10))).toBe('Aegis-Call');
  });
});
