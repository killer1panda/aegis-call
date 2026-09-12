import { describe, it, expect } from 'vitest';
import {
  splitSecret,
  reconstructSecret,
  formatShareString,
  parseShareString,
} from '../src/shamir.js';

describe("Shamir's Secret Sharing GF(2^8) (Social Key Recovery)", () => {
  it('should split a 32-byte master key into 5 shares and reconstruct with any 3 shares', () => {
    const masterKey = globalThis.crypto.getRandomValues(new Uint8Array(32));

    // 3-of-5 threshold scheme
    const shares = splitSecret(masterKey, 5, 3);
    expect(shares.length).toBe(5);

    // Reconstruct with shares [0, 1, 2]
    const recovered1 = reconstructSecret([shares[0], shares[1], shares[2]]);
    expect(Buffer.from(recovered1).equals(Buffer.from(masterKey))).toBe(true);

    // Reconstruct with shares [1, 3, 4]
    const recovered2 = reconstructSecret([shares[1], shares[3], shares[4]]);
    expect(Buffer.from(recovered2).equals(Buffer.from(masterKey))).toBe(true);

    // Reconstruct with all 5 shares
    const recoveredAll = reconstructSecret(shares);
    expect(Buffer.from(recoveredAll).equals(Buffer.from(masterKey))).toBe(true);
  });

  it('should produce incorrect output when fewer than threshold shares are provided', () => {
    const masterKey = new TextEncoder().encode('sovereign-master-key-32-bytes!!!');
    const shares = splitSecret(masterKey, 5, 3);

    // Only 2 shares provided for a 3-threshold polynomial -> fails to recover secret
    const incomplete = reconstructSecret([shares[0], shares[1]]);
    expect(Buffer.from(incomplete).equals(Buffer.from(masterKey))).toBe(false);
  });

  it('should serialize and parse armored share strings with checksum validation', () => {
    const secret = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe]);
    const shares = splitSecret(secret, 3, 2);

    const shareStr = formatShareString(shares[0]);
    expect(shareStr.startsWith('aegis-share:1:')).toBe(true);

    const parsed = parseShareString(shareStr);
    expect(parsed.index).toBe(shares[0].index);
    expect(Buffer.from(parsed.data).equals(Buffer.from(shares[0].data))).toBe(true);

    // Corrupted checksum should throw
    const tampered = shareStr.slice(0, -4) + 'ffff';
    expect(() => parseShareString(tampered)).toThrowError(/checksum/i);
  });

  it('should reject invalid parameters (threshold < 2 or threshold > total)', () => {
    const secret = new Uint8Array(16);
    expect(() => splitSecret(secret, 5, 1)).toThrowError(/Threshold must be at least 2/);
    expect(() => splitSecret(secret, 3, 4)).toThrowError(/Threshold cannot exceed/);
    expect(() => splitSecret(new Uint8Array(0), 3, 2)).toThrowError(/Secret cannot be empty/);
  });
});
