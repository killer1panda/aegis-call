import { describe, it, expect } from 'vitest';
import {
  formatX25519DID,
  extractPublicKeyFromDID,
  resolveDIDDocument,
  createCallVerificationPresentation,
  generateIdentityKeyPair,
  signCallVerificationPresentation,
  verifyCallVerificationPresentation,
} from '../src/did.js';
import { generateEphemeralKeyPair } from '../src/keyExchange.js';

describe('W3C Decentralized Identity (did:key) & Verifiable Presentations', () => {
  it('should encode and round-trip X25519 public keys to did:key URIs', () => {
    const keyPair = generateEphemeralKeyPair();
    const didUri = formatX25519DID(keyPair.publicKey);

    expect(didUri.startsWith('did:key:z')).toBe(true);
    expect(didUri.length).toBeGreaterThan(40);

    const recoveredPk = extractPublicKeyFromDID(didUri);
    expect(Buffer.from(recoveredPk).equals(Buffer.from(keyPair.publicKey))).toBe(true);
  });

  it('should resolve W3C standard DID document with verification methods', () => {
    const keyPair = generateEphemeralKeyPair();
    const didUri = formatX25519DID(keyPair.publicKey);

    const doc = resolveDIDDocument(didUri);

    expect(doc.id).toBe(didUri);
    expect(doc['@context']).toContain('https://www.w3.org/ns/did/v1');
    expect(doc.verificationMethod.length).toBe(1);
    expect(doc.verificationMethod[0].type).toBe('X25519KeyAgreementKey2020');
    expect(doc.verificationMethod[0].controller).toBe(didUri);
    expect(doc.keyAgreement).toContain(doc.verificationMethod[0].id);
  });

  it('should construct cryptographic Verifiable Presentation for mutual call authentication', () => {
    const alice = generateEphemeralKeyPair();
    const bob = generateEphemeralKeyPair();
    const aliceDid = formatX25519DID(alice.publicKey);
    const bobDid = formatX25519DID(bob.publicKey);

    const vp = createCallVerificationPresentation(
      aliceDid,
      bobDid,
      'SHA256:7F:B3:99:A0',
      'room-did-test',
      'mock-sig-hex-772211'
    );

    expect(vp.type).toContain('VerifiablePresentation');
    expect(vp.type).toContain('AegisMutualCallVerification');
    expect(vp.verifiableCredential.issuer).toBe(aliceDid);
    expect(vp.verifiableCredential.credentialSubject.verifiedPeer).toBe(bobDid);
    expect(vp.verifiableCredential.credentialSubject.roomId).toBe('room-did-test');
    expect(vp.proof.jws).toBe('mock-sig-hex-772211');
  });

  it('should reject malformed did:key inputs with clear exceptions', () => {
    expect(() => extractPublicKeyFromDID('invalid:uri')).toThrowError(/Invalid did:key format/);
    expect(() => formatX25519DID(new Uint8Array(16))).toThrowError(/Invalid public key length/);
  });

  it('should generate Ed25519 identity keypairs, sign, and verify Verifiable Presentations', () => {
    const aliceId = generateIdentityKeyPair();
    const bobId = generateIdentityKeyPair();

    expect(aliceId.did.startsWith('did:key:z')).toBe(true);
    expect(bobId.did.startsWith('did:key:z')).toBe(true);

    const vp = signCallVerificationPresentation(
      aliceId.privateKey,
      aliceId.did,
      bobId.did,
      'SHA256:E2EE:FINGERPRINT:9901',
      'room-quantum-shield-1'
    );

    expect(vp.proof.jws.length).toBe(128); // 64 bytes in hex

    // Verify valid presentation
    const result = verifyCallVerificationPresentation(vp, 'room-quantum-shield-1');
    expect(result.valid).toBe(true);
    expect(result.issuerDid).toBe(aliceId.did);
    expect(result.verifiedPeerDid).toBe(bobId.did);
    expect(result.sasFingerprint).toBe('SHA256:E2EE:FINGERPRINT:9901');

    // Reject on room ID mismatch
    const wrongRoom = verifyCallVerificationPresentation(vp, 'wrong-room-id');
    expect(wrongRoom.valid).toBe(false);
    expect(wrongRoom.reason).toContain('Room ID mismatch');

    // Reject on tampered fingerprint
    const tamperedVp = JSON.parse(JSON.stringify(vp));
    tamperedVp.verifiableCredential.credentialSubject.sasFingerprint = 'SHA256:TAMPERED:FINGERPRINT';
    const tamperedResult = verifyCallVerificationPresentation(tamperedVp, 'room-quantum-shield-1');
    expect(tamperedResult.valid).toBe(false);
    expect(tamperedResult.reason).toContain('tampered credential');
  });

  it('should generate ML-DSA-65 + Ed25519 hybrid identity keys, sign and verify post-quantum presentations', async () => {
    const {
      generateHybridIdentityKeyPair,
      signHybridCallVerificationPresentation,
      verifyHybridCallVerificationPresentation,
    } = await import('../src/did.js');

    const aliceHybrid = generateHybridIdentityKeyPair();
    const bobHybrid = generateHybridIdentityKeyPair();

    expect(aliceHybrid.ed25519.did.startsWith('did:key:z')).toBe(true);
    expect(aliceHybrid.hybridDid).toContain('#mldsa65-');
    expect(aliceHybrid.mldsa65.publicKey.length).toBeGreaterThan(1000); // ML-DSA-65 public key is 1952 bytes

    const presentation = signHybridCallVerificationPresentation(
      aliceHybrid,
      bobHybrid.ed25519.did,
      'SAS:9988-1122',
      'quantum-bunker-alpha'
    );

    expect(presentation.proof.type).toBe('HybridEd25519MLDSA65Signature2026');
    expect((presentation.proof as any).pqcProofHex).toBeDefined();

    // Verify valid presentation
    const result = verifyHybridCallVerificationPresentation(presentation, 'quantum-bunker-alpha');
    expect(result.valid).toBe(true);
    expect(result.isPostQuantumVerified).toBe(true);
    expect(result.issuerDid).toBe(aliceHybrid.ed25519.did);

    // Tampered credential subject should fail post-quantum & classical verification
    const tampered = JSON.parse(JSON.stringify(presentation));
    tampered.verifiableCredential.credentialSubject.sasFingerprint = 'SAS:TAMPERED';
    const tamperedResult = verifyHybridCallVerificationPresentation(tampered, 'quantum-bunker-alpha');
    expect(tamperedResult.valid).toBe(false);
  });

  it('should generate and cryptographically sign dual-signed Call Recording Attestations', async () => {
    const {
      generateIdentityKeyPair,
      signCallRecordingAttestation,
    } = await import('../src/did.js');

    const host = generateIdentityKeyPair();
    const attestation = signCallRecordingAttestation(
      host.privateKey,
      host.did,
      'room-secure-exec',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      182,
      [host.did, 'did:key:z6MkuBobPeerDid']
    );

    expect(attestation.type).toContain('AegisCallRecordingAttestation');
    expect(attestation.verifiableCredential.credentialSubject.durationSeconds).toBe(182);
    expect(attestation.verifiableCredential.credentialSubject.recordingSha256).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    expect(attestation.proof.jws.length).toBe(128);
    expect(attestation.proof.proofPurpose).toBe('assertionMethod');
  });
});
