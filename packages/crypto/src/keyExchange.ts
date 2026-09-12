import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { KeyPair, DerivedSessionKeys, DirectionalSessionKeys } from './types.js';

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
 * Computes raw X25519 ECDH shared secret.
 */
export function deriveSharedSecret(ourPrivateKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(ourPrivateKey, peerPublicKey);
}

/**
 * Computes an ECDH shared secret and derives directional session keys for initiator and responder
 * using HKDF-SHA256, eliminating AES-GCM nonce collision (CWE-323).
 *
 * Roles ('initiator' vs 'responder') are deterministically resolved by lexicographically
 * comparing local and remote public keys, ensuring identical peer agreement without signaling glare.
 */
export function deriveDirectionalSessionKeys(
  ourPrivateKey: Uint8Array,
  ourPublicKey: Uint8Array,
  peerPublicKey: Uint8Array,
  roomId: string
): DirectionalSessionKeys {
  const sharedSecret = x25519.getSharedSecret(ourPrivateKey, peerPublicKey);
  const salt = sha256(new TextEncoder().encode(`aegis-directional-salt:${roomId}`));

  // Total required key material:
  // 32B (init audio) + 32B (resp audio) + 32B (init video) + 32B (resp video) +
  // 32B (init data) + 32B (resp data) + 12B (init iv) + 12B (resp iv) + 32B (sas) = 248 bytes
  const info = new TextEncoder().encode('aegis-e2ee-directional-keys-v1');
  const derivedBytes = hkdf(sha256, sharedSecret, salt, info, 248);

  const initAudio = derivedBytes.slice(0, 32);
  const respAudio = derivedBytes.slice(32, 64);
  const initVideo = derivedBytes.slice(64, 96);
  const respVideo = derivedBytes.slice(96, 128);
  const initData = derivedBytes.slice(128, 160);
  const respData = derivedBytes.slice(160, 192);
  const initIv = derivedBytes.slice(192, 204);
  const respIv = derivedBytes.slice(204, 216);
  const sasEntropy = derivedBytes.slice(216, 248);

  // Deterministic role assignment: compare hex strings
  const ourHex = bytesToHex(ourPublicKey);
  const peerHex = bytesToHex(peerPublicKey);
  const isInitiator = ourHex.localeCompare(peerHex) < 0;

  if (isInitiator) {
    return {
      sendAudioKey: initAudio,
      sendVideoKey: initVideo,
      sendDataKey: initData,
      sendIvBase: initIv,
      recvAudioKey: respAudio,
      recvVideoKey: respVideo,
      recvDataKey: respData,
      recvIvBase: respIv,
      sasEntropy,
      role: 'initiator',
    };
  } else {
    return {
      sendAudioKey: respAudio,
      sendVideoKey: respVideo,
      sendDataKey: respData,
      sendIvBase: respIv,
      recvAudioKey: initAudio,
      recvVideoKey: initVideo,
      recvDataKey: initData,
      recvIvBase: initIv,
      sasEntropy,
      role: 'responder',
    };
  }
}

/**
 * Computes an ECDH shared secret and uses HKDF-SHA256 to deterministically derive
 * independent symmetric keys for Audio, Video, and DataChannel, along with SAS entropy.
 * Kept for backward compatibility.
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

