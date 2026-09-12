import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Standard Base58 alphabet (Bitcoin standard)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(source: Uint8Array): string {
  if (source.length === 0) return '';
  const digits = [0];
  for (let i = 0; i < source.length; i++) {
    let carry = source[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let output = '';
  for (let i = 0; i < source.length && source[i] === 0; i++) {
    output += '1';
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    output += BASE58_ALPHABET[digits[i]];
  }
  return output;
}

function decodeBase58(string: string): Uint8Array {
  if (string.length === 0) return new Uint8Array(0);
  const bytes = [0];
  for (let i = 0; i < string.length; i++) {
    const char = string[i];
    const value = BASE58_ALPHABET.indexOf(char);
    if (value === -1) {
      throw new Error(`Invalid base58 character '${char}'`);
    }
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  for (let i = 0; i < string.length && string[i] === '1'; i++) {
    leadingZeros++;
  }
  const result = new Uint8Array(leadingZeros + bytes.length);
  for (let i = 0; i < leadingZeros; i++) {
    result[i] = 0;
  }
  for (let i = 0; i < bytes.length; i++) {
    result[leadingZeros + i] = bytes[bytes.length - 1 - i];
  }
  return result;
}

export interface W3CVerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase: string;
}

export interface W3CDIDDocument {
  '@context': string[];
  id: string;
  verificationMethod: W3CVerificationMethod[];
  authentication: string[];
  keyAgreement: string[];
}

export interface VerifiablePresentation {
  '@context': string[];
  type: string[];
  verifiableCredential: {
    id: string;
    issuer: string;
    issuanceDate: string;
    credentialSubject: {
      id: string;
      verifiedPeer: string;
      sasFingerprint: string;
      roomId: string;
    };
  };
  proof: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    jws: string;
  };
}

// Multicodec prefix for X25519 public key = 0xec, 0x01
const X25519_MULTICODEC_PREFIX = new Uint8Array([0xec, 0x01]);

/**
 * Encodes an X25519 public key into a W3C did:key URI using multicodec + base58-btc (z).
 */
export function formatX25519DID(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new Error(`Invalid public key length for X25519 DID: expected 32 bytes, got ${publicKey.length}`);
  }

  const multicodec = new Uint8Array(X25519_MULTICODEC_PREFIX.length + publicKey.length);
  multicodec.set(X25519_MULTICODEC_PREFIX, 0);
  multicodec.set(publicKey, X25519_MULTICODEC_PREFIX.length);

  const base58 = encodeBase58(multicodec);
  return `did:key:z${base58}`;
}

/**
 * Extracts raw X25519 public key from a did:key:z... URI.
 */
export function extractPublicKeyFromDID(didUri: string): Uint8Array {
  if (!didUri.startsWith('did:key:z')) {
    throw new Error(`Invalid did:key format: expected did:key:z..., got ${didUri}`);
  }

  const base58Str = didUri.slice('did:key:z'.length);
  const bytes = decodeBase58(base58Str);

  if (bytes.length !== X25519_MULTICODEC_PREFIX.length + 32) {
    throw new Error(`Invalid DID key byte length: got ${bytes.length}`);
  }

  // Verify multicodec prefix (0xec, 0x01)
  if (bytes[0] !== X25519_MULTICODEC_PREFIX[0] || bytes[1] !== X25519_MULTICODEC_PREFIX[1]) {
    throw new Error('Unsupported DID multicodec prefix: expected X25519');
  }

  return bytes.slice(X25519_MULTICODEC_PREFIX.length);
}

// Multicodec prefix for Ed25519 public key = 0xed, 0x01
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);

/**
 * Encodes an Ed25519 public key into a W3C did:key URI using multicodec + base58-btc (z).
 */
export function formatEd25519DID(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new Error(`Invalid public key length for Ed25519 DID: expected 32 bytes, got ${publicKey.length}`);
  }

  const multicodec = new Uint8Array(ED25519_MULTICODEC_PREFIX.length + publicKey.length);
  multicodec.set(ED25519_MULTICODEC_PREFIX, 0);
  multicodec.set(publicKey, ED25519_MULTICODEC_PREFIX.length);

  const base58 = encodeBase58(multicodec);
  return `did:key:z${base58}`;
}

/**
 * Extracts raw Ed25519 public key from a did:key:z... URI.
 */
export function extractEd25519PublicKey(didUri: string): Uint8Array {
  if (!didUri.startsWith('did:key:z')) {
    throw new Error(`Invalid did:key format: expected did:key:z..., got ${didUri}`);
  }

  const base58Str = didUri.slice('did:key:z'.length);
  const bytes = decodeBase58(base58Str);

  if (bytes.length !== ED25519_MULTICODEC_PREFIX.length + 32) {
    throw new Error(`Invalid DID key byte length: got ${bytes.length}`);
  }

  // Verify multicodec prefix (0xed, 0x01)
  if (bytes[0] !== ED25519_MULTICODEC_PREFIX[0] || bytes[1] !== ED25519_MULTICODEC_PREFIX[1]) {
    throw new Error('Unsupported DID multicodec prefix: expected Ed25519 (0xed01)');
  }

  return bytes.slice(ED25519_MULTICODEC_PREFIX.length);
}

/**
 * Generates an Ed25519 identity keypair bound to a W3C did:key identifier.
 */
export function generateIdentityKeyPair(): {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  did: string;
} {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  const did = formatEd25519DID(publicKey);
  return { publicKey, privateKey, did };
}

/**
 * Resolves a did:key into a standard W3C Decentralized Identifier (DID) Document.
 */
export function resolveDIDDocument(didUri: string): W3CDIDDocument {
  const isEd25519 = (() => {
    try {
      extractEd25519PublicKey(didUri);
      return true;
    } catch {
      return false;
    }
  })();

  const keyId = `${didUri}#${didUri.split(':').pop()}`;

  const vm: W3CVerificationMethod = {
    id: keyId,
    type: isEd25519 ? 'Ed25519VerificationKey2020' : 'X25519KeyAgreementKey2020',
    controller: didUri,
    publicKeyMultibase: didUri.replace('did:key:', ''),
  };

  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1',
    ],
    id: didUri,
    verificationMethod: [vm],
    authentication: [keyId],
    keyAgreement: isEd25519 ? [] : [keyId],
  };
}

/**
 * Computes canonical SHA-256 digest of a verifiable credential payload.
 */
export function computeCredentialDigest(credential: VerifiablePresentation['verifiableCredential']): Uint8Array {
  const canonicalString = `aegis-credential-v1:${credential.id}:${credential.issuer}:${credential.issuanceDate}:${credential.credentialSubject.id}:${credential.credentialSubject.verifiedPeer}:${credential.credentialSubject.sasFingerprint}:${credential.credentialSubject.roomId}`;
  return sha256(new TextEncoder().encode(canonicalString));
}

/**
 * Constructs a verifiable presentation proving mutual call authentication and DID identity binding.
 */
export function createCallVerificationPresentation(
  issuerDid: string,
  verifiedPeerDid: string,
  sasFingerprint: string,
  roomId: string,
  signatureHex: string = ''
): VerifiablePresentation {
  const now = new Date().toISOString();
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://www.w3.org/2018/credentials/v1',
    ],
    type: ['VerifiablePresentation', 'AegisMutualCallVerification'],
    verifiableCredential: {
      id: `urn:uuid:${bytesToHex(sha256(new TextEncoder().encode(`${issuerDid}:${roomId}:${now}`)))}`,
      issuer: issuerDid,
      issuanceDate: now,
      credentialSubject: {
        id: issuerDid,
        verifiedPeer: verifiedPeerDid,
        sasFingerprint,
        roomId,
      },
    },
    proof: {
      type: 'Ed25519Signature2020',
      created: now,
      verificationMethod: `${issuerDid}#key-1`,
      proofPurpose: 'authentication',
      jws: signatureHex,
    },
  };
}

/**
 * Signs a Call Verification Presentation using an Ed25519 identity private key.
 */
export function signCallVerificationPresentation(
  issuerPrivateKey: Uint8Array,
  issuerDid: string,
  verifiedPeerDid: string,
  sasFingerprint: string,
  roomId: string
): VerifiablePresentation {
  const presentation = createCallVerificationPresentation(
    issuerDid,
    verifiedPeerDid,
    sasFingerprint,
    roomId
  );

  const digest = computeCredentialDigest(presentation.verifiableCredential);
  const signatureBytes = ed25519.sign(digest, issuerPrivateKey);
  presentation.proof.jws = bytesToHex(signatureBytes);

  return presentation;
}

export interface VerificationResult {
  valid: boolean;
  issuerDid?: string;
  verifiedPeerDid?: string;
  sasFingerprint?: string;
  roomId?: string;
  issuanceDate?: string;
  reason?: string;
}

/**
 * Cryptographically verifies a W3C Verifiable Presentation against the issuer's public key.
 */
export function verifyCallVerificationPresentation(
  presentation: VerifiablePresentation,
  expectedRoomId?: string
): VerificationResult {
  if (!presentation || !presentation.verifiableCredential || !presentation.proof) {
    return { valid: false, reason: 'Malformed Verifiable Presentation structure' };
  }

  const { verifiableCredential, proof } = presentation;

  if (expectedRoomId && verifiableCredential.credentialSubject?.roomId !== expectedRoomId) {
    return {
      valid: false,
      reason: `Room ID mismatch: expected ${expectedRoomId}, got ${verifiableCredential.credentialSubject?.roomId}`,
    };
  }

  if (!proof.jws || proof.jws.length !== 128) {
    return { valid: false, reason: 'Invalid signature format in proof (expected 128-hex character 64-byte Ed25519 signature)' };
  }

  try {
    const issuerDid = verifiableCredential.issuer;
    const publicKey = extractEd25519PublicKey(issuerDid);
    const signatureBytes = hexToBytes(proof.jws);
    const digest = computeCredentialDigest(verifiableCredential);

    const isValid = ed25519.verify(signatureBytes, digest, publicKey);
    if (!isValid) {
      return { valid: false, reason: 'Cryptographic signature verification failed (tampered credential)' };
    }

    return {
      valid: true,
      issuerDid,
      verifiedPeerDid: verifiableCredential.credentialSubject.verifiedPeer,
      sasFingerprint: verifiableCredential.credentialSubject.sasFingerprint,
      roomId: verifiableCredential.credentialSubject.roomId,
      issuanceDate: verifiableCredential.issuanceDate,
    };
  } catch (err: any) {
    return {
      valid: false,
      reason: `Signature verification error: ${err.message || 'unknown error'}`,
    };
  }
}

