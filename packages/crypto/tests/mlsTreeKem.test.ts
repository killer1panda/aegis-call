import { describe, it, expect } from 'vitest';
import { MLSTreeKEM } from '../src/mlsTreeKem.js';
import { generateEphemeralKeyPair } from '../src/keyExchange.js';

describe('RFC 9420 TreeKEM MLS Group Key Agreement', () => {
  it('should initialize group with epoch 0 and root secret', () => {
    const mls = new MLSTreeKEM('group-secure-conferencing');
    expect(mls.getEpoch()).toBe(0);
    expect(mls.getGroupSecret().length).toBe(32);
    expect(mls.getActiveMembers().length).toBe(0);
  });

  it('should add members in O(log N) operations and ratchet epoch state', () => {
    const mls = new MLSTreeKEM('group-multi-party-call');
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const charlie = generateEphemeralKeyPair();

    // 1. Add Alice
    const commitAlice = mls.addMember('alice', alice.publicKey);
    expect(commitAlice.epoch).toBe(1);
    expect(commitAlice.action).toBe('ADD');
    expect(commitAlice.targetMemberId).toBe('alice');
    expect(commitAlice.pathSecrets.length).toBeGreaterThan(0);
    expect(mls.getActiveMembers().length).toBe(1);

    const keysEpoch1 = mls.deriveGroupSessionKeys();

    // 2. Add Bob
    const commitBob = mls.addMember('bob', bob.publicKey);
    expect(commitBob.epoch).toBe(2);
    expect(mls.getActiveMembers().length).toBe(2);

    const keysEpoch2 = mls.deriveGroupSessionKeys();

    // Verify Backward Secrecy: Keys from Epoch 1 and Epoch 2 differ
    expect(Buffer.from(keysEpoch1.audioKey).equals(Buffer.from(keysEpoch2.audioKey))).toBe(false);
    expect(Buffer.from(keysEpoch1.sasEntropy).equals(Buffer.from(keysEpoch2.sasEntropy))).toBe(false);

    // 3. Add Charlie
    const commitCharlie = mls.addMember('charlie', charlie.publicKey);
    expect(commitCharlie.epoch).toBe(3);
    expect(mls.getActiveMembers().length).toBe(3);

    const keysEpoch3 = mls.deriveGroupSessionKeys();
    expect(Buffer.from(keysEpoch2.audioKey).equals(Buffer.from(keysEpoch3.audioKey))).toBe(false);
  });

  it('should guarantee forward secrecy when removing a participant', () => {
    const mls = new MLSTreeKEM('group-forward-secrecy-test');
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();

    mls.addMember('alice', alice.publicKey);
    mls.addMember('bob', bob.publicKey);

    const preRemovalKeys = mls.deriveGroupSessionKeys();

    // Remove Bob
    const removeCommit = mls.removeMember('bob');
    expect(removeCommit.action).toBe('REMOVE');
    expect(mls.getActiveMembers().length).toBe(1);
    expect(mls.getActiveMembers()[0].memberId).toBe('alice');

    const postRemovalKeys = mls.deriveGroupSessionKeys();

    // Forward secrecy verified: group secret is rotated
    expect(Buffer.from(preRemovalKeys.audioKey).equals(Buffer.from(postRemovalKeys.audioKey))).toBe(false);
    expect(Buffer.from(preRemovalKeys.videoKey).equals(Buffer.from(postRemovalKeys.videoKey))).toBe(false);
  });

  it('should update member leaf key and compute distinct tree hash', () => {
    const mls = new MLSTreeKEM('group-key-update-test');
    const alice1 = generateEphemeralKeyPair();
    const alice2 = generateEphemeralKeyPair();

    mls.addMember('alice', alice1.publicKey);
    const hash1 = mls.computeTreeHash();

    mls.updateKey('alice', alice2.publicKey);
    const hash2 = mls.computeTreeHash();

    expect(Buffer.from(hash1).equals(Buffer.from(hash2))).toBe(false);
  });

  it('should reject invalid member operations with descriptive errors', () => {
    const mls = new MLSTreeKEM('group-error-handling');
    const alice = generateEphemeralKeyPair();

    mls.addMember('alice', alice.publicKey);
    expect(() => mls.addMember('alice', alice.publicKey)).toThrowError(/already actively joined/);
    expect(() => mls.removeMember('unknown-user')).toThrowError(/not an active participant/);
  });
});
