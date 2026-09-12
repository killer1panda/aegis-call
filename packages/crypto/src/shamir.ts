import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha2';

/**
 * Galois Field GF(2^8) with primitive irreducible polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11d)
 * and generator element alpha = 2 of full order 255.
 */
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  LOG_TABLE[0] = 0; // Undefined mathematically, but set to 0 as sentinel
})();

function gfAdd(a: number, b: number): number {
  return a ^ b;
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero in GF(2^8)');
  if (a === 0) return 0;
  let logDiff = LOG_TABLE[a] - LOG_TABLE[b];
  if (logDiff < 0) logDiff += 255;
  return EXP_TABLE[logDiff];
}

export interface ShamirShare {
  index: number; // 1 to 255
  data: Uint8Array;
}

/**
 * Splits an arbitrary byte array secret into N shares with threshold K using Shamir's Secret Sharing.
 */
export function splitSecret(
  secret: Uint8Array,
  totalShares: number,
  threshold: number
): ShamirShare[] {
  if (threshold < 2) {
    throw new Error('Threshold must be at least 2');
  }
  if (threshold > totalShares) {
    throw new Error('Threshold cannot exceed totalShares');
  }
  if (totalShares > 255) {
    throw new Error('Total shares cannot exceed 255 in GF(2^8)');
  }
  if (secret.length === 0) {
    throw new Error('Secret cannot be empty');
  }

  const shares: ShamirShare[] = [];
  for (let i = 1; i <= totalShares; i++) {
    shares.push({
      index: i,
      data: new Uint8Array(secret.length),
    });
  }

  // Generate polynomial for each byte of the secret:
  // f(x) = secret + c1*x + c2*x^2 + ... + c_{k-1}*x^{k-1}
  const coeffs = new Uint8Array(threshold);

  for (let byteIdx = 0; byteIdx < secret.length; byteIdx++) {
    coeffs[0] = secret[byteIdx];
    for (let c = 1; c < threshold; c++) {
      const randByte = globalThis.crypto.getRandomValues(new Uint8Array(1))[0];
      coeffs[c] = randByte;
    }

    // Evaluate polynomial for each share index 1..totalShares
    for (let s = 0; s < totalShares; s++) {
      const x = shares[s].index;
      let y = 0;
      for (let c = threshold - 1; c >= 0; c--) {
        y = gfAdd(gfMul(y, x), coeffs[c]);
      }
      shares[s].data[byteIdx] = y;
    }
  }

  return shares;
}

/**
 * Reconstructs the original secret from K or more valid shares using Lagrange polynomial interpolation.
 */
export function reconstructSecret(shares: ShamirShare[]): Uint8Array {
  if (shares.length < 2) {
    throw new Error('At least 2 shares are required to reconstruct secret');
  }

  const secretLen = shares[0].data.length;
  // Verify all shares have equal length and unique non-zero indices
  const seenIndices = new Set<number>();
  for (const share of shares) {
    if (share.data.length !== secretLen) {
      throw new Error('Mismatched share lengths');
    }
    if (share.index <= 0 || share.index > 255) {
      throw new Error(`Invalid share index: ${share.index}`);
    }
    if (seenIndices.has(share.index)) {
      throw new Error(`Duplicate share index: ${share.index}`);
    }
    seenIndices.add(share.index);
  }

  const k = shares.length;
  const reconstructed = new Uint8Array(secretLen);

  for (let byteIdx = 0; byteIdx < secretLen; byteIdx++) {
    let secretByte = 0;

    for (let i = 0; i < k; i++) {
      const xi = shares[i].index;
      const yi = shares[i].data[byteIdx];

      // Compute Lagrange basis polynomial L_i(0):
      // prod_{j != i} (0 - x_j) / (x_i - x_j)
      // Note: in GF(2^8), subtraction is identical to addition (XOR)
      let basis = 1;
      for (let j = 0; j < k; j++) {
        if (i === j) continue;
        const xj = shares[j].index;
        const numerator = xj; // (0 ^ x_j) = x_j
        const denominator = gfAdd(xi, xj); // (x_i ^ x_j)
        const term = gfDiv(numerator, denominator);
        basis = gfMul(basis, term);
      }

      secretByte = gfAdd(secretByte, gfMul(yi, basis));
    }

    reconstructed[byteIdx] = secretByte;
  }

  return reconstructed;
}

/**
 * Encodes a ShamirShare into an armored portable string with integrity checksum.
 */
export function formatShareString(share: ShamirShare): string {
  const hexData = bytesToHex(share.data);
  const checksum = bytesToHex(sha256(new TextEncoder().encode(`${share.index}:${hexData}`)).slice(0, 4));
  return `aegis-share:${share.index}:${hexData}:${checksum}`;
}

/**
 * Parses and verifies an armored ShamirShare string.
 */
export function parseShareString(shareStr: string): ShamirShare {
  const parts = shareStr.trim().split(':');
  if (parts.length !== 4 || parts[0] !== 'aegis-share') {
    throw new Error('Invalid share string format: expected aegis-share:<index>:<hex>:<checksum>');
  }

  const index = parseInt(parts[1], 10);
  const hexData = parts[2];
  const expectedChecksum = parts[3];

  const actualChecksum = bytesToHex(sha256(new TextEncoder().encode(`${index}:${hexData}`)).slice(0, 4));
  if (actualChecksum !== expectedChecksum) {
    throw new Error('Share checksum verification failed (corrupted or tampered share string)');
  }

  return {
    index,
    data: hexToBytes(hexData),
  };
}
