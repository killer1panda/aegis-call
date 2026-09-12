import { ml_kem768_x25519 } from '@noble/post-quantum/hybrid.js';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { DerivedSessionKeys } from './types.js';

export interface HybridKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  publicKeyHex: string;
  classicalPublicKey: Uint8Array;
  postQuantumPublicKey: Uint8Array;
}

export interface HybridEncapsulationResult {
  cipherText: Uint8Array;
  cipherTextHex: string;
  sharedSecret: Uint8Array;
  sessionKeys: DerivedSessionKeys;
}

export const HYBRID_KEY_LENGTHS = {
  publicKey: 1216,      // 32B X25519 + 1184B ML-KEM-768
  secretKey: 32,        // Seed representation
  cipherText: 1120,     // 32B X25519 ephemeral PK + 1088B ML-KEM ciphertext
  sharedSecret: 32,     // 32B combined hybrid shared secret
  classicalPk: 32,      // 32B X25519
  postQuantumPk: 1184,  // 1184B ML-KEM-768
} as const;

/**
 * Generates an ephemeral Hybrid Post-Quantum KeyPair combining ML-KEM-768 and X25519.
 * This guarantees resistance against quantum threats ("harvest now, decrypt later")
 * while maintaining proven classical curve25519 security.
 */
export function generateHybridKeyPair(): HybridKeyPair {
  const kp = ml_kem768_x25519.keygen();
  const publicKey = kp.publicKey;
  const secretKey = kp.secretKey;
  const publicKeyHex = bytesToHex(publicKey);

  return {
    publicKey,
    secretKey,
    publicKeyHex,
    classicalPublicKey: publicKey.slice(0, HYBRID_KEY_LENGTHS.classicalPk),
    postQuantumPublicKey: publicKey.slice(HYBRID_KEY_LENGTHS.classicalPk),
  };
}

/**
 * Derives independent symmetric keys and SAS entropy from the hybrid shared secret
 * using HKDF-SHA256 with room-specific domain separation salt.
 */
export function deriveHybridSessionKeys(
  sharedSecret: Uint8Array,
  roomId: string
): DerivedSessionKeys {
  const salt = sha256(new TextEncoder().encode(`aegis-hybrid-pqc-salt:${roomId}`));
  const info = new TextEncoder().encode('aegis-hybrid-x25519-mlkem768-v1');

  // Total required key material:
  // 32 bytes (audio key) + 32 bytes (video key) + 32 bytes (data key) + 12 bytes (ivBase) + 32 bytes (SAS) = 140 bytes
  const derivedBytes = hkdf(sha256, sharedSecret, salt, info, 140);

  return {
    audioKey: derivedBytes.slice(0, 32),
    videoKey: derivedBytes.slice(32, 64),
    dataKey: derivedBytes.slice(64, 96),
    ivBase: derivedBytes.slice(96, 108),
    sasEntropy: derivedBytes.slice(108, 140),
  };
}

/**
 * Encapsulates a hybrid shared secret using the recipient's hybrid public key.
 * Used by the call initiator or responder to establish quantum-secure session keys.
 *
 * @param recipientPublicKey 1216-byte hybrid public key (Uint8Array or hex string)
 * @param roomId Context string for HKDF salt / domain separation
 */
export function encapsulateHybrid(
  recipientPublicKey: Uint8Array | string,
  roomId: string
): HybridEncapsulationResult {
  const pkBytes = typeof recipientPublicKey === 'string'
    ? hexToBytes(recipientPublicKey)
    : recipientPublicKey;

  if (pkBytes.length !== HYBRID_KEY_LENGTHS.publicKey) {
    throw new Error(
      `Invalid hybrid public key length: expected ${HYBRID_KEY_LENGTHS.publicKey} bytes, got ${pkBytes.length}`
    );
  }

  const { cipherText, sharedSecret } = ml_kem768_x25519.encapsulate(pkBytes);
  const sessionKeys = deriveHybridSessionKeys(sharedSecret, roomId);

  return {
    cipherText,
    cipherTextHex: bytesToHex(cipherText),
    sharedSecret,
    sessionKeys,
  };
}

/**
 * Decapsulates the recipient's hybrid shared secret from the received encapsulation ciphertext
 * and derives identical symmetric session keys.
 *
 * @param cipherText 1120-byte encapsulation ciphertext (Uint8Array or hex string)
 * @param secretKey 32-byte secret key seed of recipient
 * @param roomId Context string for HKDF salt / domain separation
 */
export function decapsulateHybrid(
  cipherText: Uint8Array | string,
  secretKey: Uint8Array,
  roomId: string
): DerivedSessionKeys {
  const ctBytes = typeof cipherText === 'string'
    ? hexToBytes(cipherText)
    : cipherText;

  if (ctBytes.length !== HYBRID_KEY_LENGTHS.cipherText) {
    throw new Error(
      `Invalid hybrid ciphertext length: expected ${HYBRID_KEY_LENGTHS.cipherText} bytes, got ${ctBytes.length}`
    );
  }

  const sharedSecret = ml_kem768_x25519.decapsulate(ctBytes, secretKey);
  return deriveHybridSessionKeys(sharedSecret, roomId);
}
