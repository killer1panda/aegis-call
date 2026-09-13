import { describe, it, expect } from 'vitest';
import { IdentityService } from '../src/services/identityService.js';
import { verifyCallRecordingAttestation } from '@aegis/crypto';

// Ensure sessionStorage exists in Node test environment
if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).sessionStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('AegisCall Local Decentralized Identity & Attestation Service', () => {
  it('should generate and cache local decentralized identity with valid did:key format', () => {
    const identity1 = IdentityService.getOrCreateIdentity();
    expect(identity1).toBeDefined();
    expect(identity1.publicKey).toBeInstanceOf(Uint8Array);
    expect(identity1.privateKey).toBeInstanceOf(Uint8Array);
    expect(identity1.publicKey.length).toBe(32);
    expect(identity1.privateKey.length).toBe(32);
    expect(identity1.did.startsWith('did:key:z')).toBe(true);

    // Subsequent calls return the same cached identity in this session
    const identity2 = IdentityService.getOrCreateIdentity();
    expect(identity2.did).toBe(identity1.did);
  });

  it('should sign call recording attestations and cryptographically verify them', () => {
    const identity = IdentityService.getOrCreateIdentity();
    const roomId = 'conf-room-attestation-1';
    const fakeRecordingDigest = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const participants = [identity.did, 'did:key:zRemoteParticipant777'];

    const attestation = IdentityService.signRecording(
      roomId,
      fakeRecordingDigest,
      120, // 120 seconds duration
      participants
    );

    expect(attestation).toBeDefined();
    expect(attestation.type).toContain('AegisCallRecordingAttestation');
    expect(attestation.verifiableCredential.credentialSubject.roomId).toBe(roomId);
    expect(attestation.verifiableCredential.credentialSubject.recordingSha256).toBe(fakeRecordingDigest);
    expect(attestation.verifiableCredential.credentialSubject.durationSeconds).toBe(120);
    expect(attestation.verifiableCredential.credentialSubject.participants).toEqual(participants);
    expect(attestation.proof.jws).toBeDefined();
    expect(attestation.verifiableCredential.issuer).toBe(identity.did);

    // Cryptographically verify attestation signature using Aegis Crypto core
    const isValid = verifyCallRecordingAttestation(attestation, identity.publicKey);
    expect(isValid).toBe(true);
  });
});
