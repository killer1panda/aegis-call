import { describe, it, expect } from 'vitest';
import {
  formatX25519DID,
  extractPublicKeyFromDID,
  resolveDIDDocument,
  createCallVerificationPresentation,
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
});
