import { describe, it, expect } from 'vitest';
import { ZKMembershipEngine } from '../src/zkMembership.js';
import { ed25519 } from '@noble/curves/ed25519';

describe('AegisCall Zero-Knowledge Group Membership Attestation Subsystem', () => {
  it('should build a deterministic Merkle tree from authorized member public keys', () => {
    // Generate 4 member keypairs
    const memberPrivateKeys = Array.from({ length: 4 }, () => ed25519.utils.randomPrivateKey());
    const memberPublicKeys = memberPrivateKeys.map((sk) => ed25519.getPublicKey(sk));

    const tree = ZKMembershipEngine.buildMerkleTree(memberPublicKeys);

    expect(tree.rootHex).toHaveLength(64);
    expect(tree.leaves).toHaveLength(4);
    expect(tree.depth).toBe(2);

    // Tree construction is deterministic
    const tree2 = ZKMembershipEngine.buildMerkleTree(memberPublicKeys);
    expect(tree2.rootHex).toBe(tree.rootHex);
  });

  it('should generate and verify zero-knowledge membership proofs for an authorized member without disclosing identity', () => {
    // 4 Authorized Board Members
    const members = Array.from({ length: 4 }, () => {
      const sk = ed25519.utils.randomPrivateKey();
      return { sk, pk: ed25519.getPublicKey(sk) };
    });
    const publicKeys = members.map((m) => m.pk);
    const roomId = 'anonymous-whistleblower-room-1';
    const tree = ZKMembershipEngine.buildMerkleTree(publicKeys);

    // Member #2 (Alice) proves membership without revealing she is index 2 or her public key
    const memberIndex = 2;
    const proof = ZKMembershipEngine.generateMembershipProof(
      memberIndex,
      members[memberIndex].sk,
      publicKeys,
      roomId
    );

    expect(proof.merkleRoot).toBe(tree.rootHex);
    expect(proof.nullifierHash).toHaveLength(64);
    expect(proof.merklePath.length).toBeGreaterThanOrEqual(2);

    // Server verifies proof against room's Merkle root
    const verification = ZKMembershipEngine.verifyMembershipProof(
      proof,
      tree.rootHex,
      roomId,
      publicKeys
    );

    expect(verification.valid).toBe(true);
    expect(verification.reason).toBeUndefined();
  });

  it('should reject membership proofs from unauthorized outsiders', () => {
    const members = Array.from({ length: 4 }, () => {
      const sk = ed25519.utils.randomPrivateKey();
      return { sk, pk: ed25519.getPublicKey(sk) };
    });
    const publicKeys = members.map((m) => m.pk);
    const tree = ZKMembershipEngine.buildMerkleTree(publicKeys);

    // Eve (unauthorized outsider) attempts to forge proof
    const outsiderSk = ed25519.utils.randomPrivateKey();
    const fakeProof = ZKMembershipEngine.generateMembershipProof(
      0,
      outsiderSk, // Wrong key!
      publicKeys,
      'secure-room'
    );

    const verification = ZKMembershipEngine.verifyMembershipProof(
      fakeProof,
      tree.rootHex,
      'secure-room',
      publicKeys
    );

    expect(verification.valid).toBe(false);
    expect(verification.reason).toContain('Cryptographic proof failed');
  });
});
