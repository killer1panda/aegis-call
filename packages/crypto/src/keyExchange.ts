import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { KeyPair, DerivedSessionKeys } from './types.js';

/**
 * Generates an ephemeral X25519 keypair for Perfect Forward Secrecy (PFS).
 */
export function generateEphemeralKeyPair(): KeyPair {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  const publicKeyHex = bytesToHex(publicKey);

  return {
    privateKey,
    publicKey,
    publicKeyHex,
  };
}

/**
 * Computes an ECDH shared secret and uses HKDF-SHA256 to deterministically derive
 * independent symmetric keys for Audio, Video, and DataChannel, along with SAS entropy.
 *
 * @param ourPrivateKey Local peer's ephemeral private key
 * @param peerPublicKey Remote peer's ephemeral public key
 * @param roomId Context string for HKDF salt / domain separation
 */
export function deriveSessionKeys(
  ourPrivateKey: Uint8Array,
  peerPublicKey: Uint8Array,
  roomId: string
): DerivedSessionKeys {
  // Compute X25519 shared secret (32 bytes)
  const sharedSecret = x25519.getSharedSecret(ourPrivateKey, peerPublicKey);

  // Domain separation salt from room ID hash
  const salt = sha256(new TextEncoder().encode(`aegis-call-salt:${roomId}`));

  // Total required key material:
  // 32 bytes (audio key) + 32 bytes (video key) + 32 bytes (data key) + 12 bytes (ivBase) + 32 bytes (SAS) = 140 bytes
  const info = new TextEncoder().encode('aegis-e2ee-key-derivation-v1');
  const derivedBytes = hkdf(sha256, sharedSecret, salt, info, 140);

  return {
    audioKey: derivedBytes.slice(0, 32),
    videoKey: derivedBytes.slice(32, 64),
    dataKey: derivedBytes.slice(64, 96),
    ivBase: derivedBytes.slice(96, 108),
    sasEntropy: derivedBytes.slice(108, 140),
  };
}

export { bytesToHex, hexToBytes };
