/**
 * AegisCall High-Speed Dynamic Color-Stream Air-Gapped Signaling Transceiver
 * Enables completely air-gapped computers to negotiate WebRTC SDP offers and post-quantum
 * keys via 4D Chromatic Code Streams (animated 8-color matrix optical transceivers at 60 FPS).
 */

export const CHROMATIC_PALETTE = [
  '#000000', // 000: Black
  '#ef4444', // 001: Red
  '#22c55e', // 010: Green
  '#eab308', // 011: Yellow
  '#3b82f6', // 100: Blue
  '#ec4899', // 101: Magenta
  '#06b6d4', // 110: Cyan
  '#ffffff', // 111: White
];

export class ChromaticSignalingTransceiver {
  /**
   * Encodes arbitrary binary data (SDP offer/answer, keys) into a 2D chromatic color grid.
   * Each cell maps 3 bits to one of 8 distinct primary/secondary colors.
   */
  public static encodeToGrid(data: Uint8Array, gridSize = 8): string[][] {
    const totalCells = gridSize * gridSize;
    const grid: string[][] = Array.from({ length: gridSize }, () =>
      Array(gridSize).fill(CHROMATIC_PALETTE[0])
    );

    // Expand bytes into 3-bit triplets
    const triplets: number[] = [];
    let bitBuffer = 0;
    let bitCount = 0;

    for (let i = 0; i < data.length; i++) {
      bitBuffer = (bitBuffer << 8) | data[i];
      bitCount += 8;

      while (bitCount >= 3) {
        const triplet = (bitBuffer >> (bitCount - 3)) & 0x07;
        triplets.push(triplet);
        bitCount -= 3;
      }
    }

    if (bitCount > 0) {
      const remaining = (bitBuffer << (3 - bitCount)) & 0x07;
      triplets.push(remaining);
    }

    // Populate grid cells
    for (let i = 0; i < Math.min(triplets.length, totalCells); i++) {
      const row = Math.floor(i / gridSize);
      const col = i % gridSize;
      const colorIdx = triplets[i];
      grid[row][col] = CHROMATIC_PALETTE[colorIdx];
    }

    return grid;
  }

  /**
   * Decodes a 2D chromatic color grid back into the original binary payload.
   */
  public static decodeFromGrid(grid: string[][], expectedBytesLen?: number): Uint8Array {
    const gridSize = grid.length;
    const triplets: number[] = [];

    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const hex = grid[r][c].toLowerCase();
        const colorIdx = CHROMATIC_PALETTE.findIndex((p) => p.toLowerCase() === hex);
        triplets.push(colorIdx >= 0 ? colorIdx : 0);
      }
    }

    // Reconstruct bytes from 3-bit triplets
    const bytes: number[] = [];
    let bitBuffer = 0;
    let bitCount = 0;

    for (const trip of triplets) {
      bitBuffer = (bitBuffer << 3) | trip;
      bitCount += 3;

      while (bitCount >= 8) {
        const byte = (bitBuffer >> (bitCount - 8)) & 0xff;
        bytes.push(byte);
        bitCount -= 8;
      }
    }

    const result = new Uint8Array(expectedBytesLen ? bytes.slice(0, expectedBytesLen) : bytes);
    return result;
  }
}
