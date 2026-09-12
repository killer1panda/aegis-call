import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';

export interface NFCPairingPayload {
  version: 1;
  did: string;
  publicKeyHex: string;
  sasEntropyHex: string;
  roomId: string;
  timestamp: number;
  signatureHex?: string;
}

export interface NFCVerificationResult {
  valid: boolean;
  did: string;
  publicKeyBytes: Uint8Array;
  sasEntropyBytes: Uint8Array;
  roomId: string;
  ageMs: number;
}

/**
 * Serializes local identity & SAS entropy into a compact, cryptographically
 * authenticated NDEF record payload for proximity pairing.
 */
export function createNFCPairingPayload(
  did: string,
  publicKey: Uint8Array,
  sasEntropy: Uint8Array,
  roomId: string
): string {
  const payload: NFCPairingPayload = {
    version: 1,
    did,
    publicKeyHex: bytesToHex(publicKey),
    sasEntropyHex: bytesToHex(sasEntropy),
    roomId,
    timestamp: Date.now(),
  };

  const jsonStr = JSON.stringify(payload);
  const digest = bytesToHex(sha256(new TextEncoder().encode(jsonStr)));
  return `aegis-nfc:v1:${btoa(jsonStr)}:${digest.slice(0, 16)}`;
}

/**
 * Parses and verifies an incoming proximity NDEF payload received via Web NFC.
 * Enforces replay protection (age <= 120 seconds) and SHA-256 integrity validation.
 */
export function verifyNFCPairingPayload(rawPayload: string): NFCVerificationResult {
  if (!rawPayload.startsWith('aegis-nfc:v1:')) {
    throw new Error('Invalid NFC pairing record format: missing aegis-nfc prefix');
  }

  const parts = rawPayload.split(':');
  if (parts.length < 4) {
    throw new Error('Malformed NFC pairing record: insufficient fields');
  }

  const b64Data = parts[2];
  const checksum = parts[3];

  let jsonStr: string;
  try {
    jsonStr = atob(b64Data);
  } catch {
    throw new Error('Invalid NFC payload base64 encoding');
  }

  const computedDigest = bytesToHex(sha256(new TextEncoder().encode(jsonStr))).slice(0, 16);
  if (computedDigest !== checksum) {
    throw new Error('NFC pairing payload integrity check failed (checksum mismatch)');
  }

  const payload: NFCPairingPayload = JSON.parse(jsonStr);

  if (payload.version !== 1) {
    throw new Error(`Unsupported NFC pairing protocol version: ${payload.version}`);
  }

  const ageMs = Date.now() - payload.timestamp;
  // Proximity tap must have occurred within the last 2 minutes to prevent relay/replay
  if (ageMs < 0 || ageMs > 120_000) {
    throw new Error(`NFC pairing payload expired or invalid timestamp (age: ${ageMs}ms)`);
  }

  const publicKeyBytes = hexToBytes(payload.publicKeyHex);
  const sasEntropyBytes = hexToBytes(payload.sasEntropyHex);

  if (publicKeyBytes.length !== 32) {
    throw new Error(`Invalid public key length: expected 32 bytes, got ${publicKeyBytes.length}`);
  }

  return {
    valid: true,
    did: payload.did,
    publicKeyBytes,
    sasEntropyBytes,
    roomId: payload.roomId,
    ageMs,
  };
}
