import { describe, it, expect } from 'vitest';
import { QuorumCallArchive } from '../src/quorumArchive.js';

describe('AegisCall Threshold M-of-N Cryptographic Call Decryption (Shamir Quorum Archive)', () => {
  it('should encrypt recording and reconstruct master key with exactly M shares (3-of-5 quorum)', async () => {
    const recordingPlaintext = new TextEncoder().encode(
      'AEGIS-CONFIDENTIAL-BOARD-MEETING-DEPOSITION-TRANSCRIPT-2026-09-13'
    );
    const roomId = 'diplomatic-quorum-room-42';

    // Split master key across 5 custodians with threshold M=3
    const { archive, shares } = await QuorumCallArchive.encryptArchive(
      recordingPlaintext,
      roomId,
      3, // Threshold M
      5  // Total N
    );

    expect(archive.archiveId).toBeDefined();
    expect(archive.thresholdM).toBe(3);
    expect(archive.totalCustodiansN).toBe(5);
    expect(shares).toHaveLength(5);

    // Custodians 1, 3, and 4 present their shares
    const subsetShares = [shares[0], shares[2], shares[3]];
    const decrypted = await QuorumCallArchive.decryptArchive(archive, subsetShares);

    expect(decrypted).toEqual(recordingPlaintext);
    expect(new TextDecoder().decode(decrypted)).toBe(
      'AEGIS-CONFIDENTIAL-BOARD-MEETING-DEPOSITION-TRANSCRIPT-2026-09-13'
    );
  });

  it('should reject decryption when quorum threshold is not met (only 2 shares provided for threshold 3)', async () => {
    const recordingPlaintext = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const { archive, shares } = await QuorumCallArchive.encryptArchive(recordingPlaintext, 'room-test', 3, 5);

    // Only 2 custodians present shares
    const insufficientShares = [shares[0], shares[1]];

    await expect(
      QuorumCallArchive.decryptArchive(archive, insufficientShares)
    ).rejects.toThrow(/Insufficient quorum/);
  });
});
