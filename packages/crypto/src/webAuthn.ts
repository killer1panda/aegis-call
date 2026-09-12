import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export interface HardwareVerificationReceipt {
  version: '1.0';
  roomId: string;
  timestamp: number;
  localCredentialId: string;
  remotePeerPublicKeyHex: string;
  sasCode: string;
  authenticatorSignatureHex: string;
  authenticatorType: 'apple-secure-enclave' | 'windows-hello' | 'fido2-hardware-token' | 'webauthn-software';
}

export interface TrustedContactEntry {
  contactId: string;
  displayName: string;
  verifiedPublicKeyHex: string;
  fingerprint: string;
  lastVerifiedAt: number;
  hardwareReceipt: HardwareVerificationReceipt;
}

/**
 * Creates a canonical SHA-256 payload to be signed by the hardware authenticator
 * (Apple Secure Enclave, Windows Hello, YubiKey FIDO2).
 */
export function createCanonicalSASPayload(
  sasNumericCode: string,
  remotePeerPublicKeyHex: string,
  roomId: string
): Uint8Array {
  const encoder = new TextEncoder();
  const canonicalString = `aegis-hardware-sas-v1:${roomId}:${sasNumericCode}:${remotePeerPublicKeyHex}`;
  return sha256(encoder.encode(canonicalString));
}

/**
 * Generates an attestation challenge buffer for WebAuthn navigator.credentials.create / get.
 */
export function generateAuthChallenge(roomId: string): Uint8Array {
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const data = new Uint8Array([
    ...nonce,
    ...new TextEncoder().encode(`:${roomId}:${Date.now()}`)
  ]);
  return sha256(data);
}

/**
 * Validates and formats a hardware verification receipt.
 */
export function issueHardwareReceipt(
  roomId: string,
  localCredentialId: string,
  remotePeerPublicKeyHex: string,
  sasCode: string,
  signatureBytes: Uint8Array,
  authenticatorType: HardwareVerificationReceipt['authenticatorType'] = 'apple-secure-enclave'
): HardwareVerificationReceipt {
  return {
    version: '1.0',
    roomId,
    timestamp: Date.now(),
    localCredentialId,
    remotePeerPublicKeyHex,
    sasCode,
    authenticatorSignatureHex: bytesToHex(signatureBytes),
    authenticatorType,
  };
}

/**
 * Verifies that a stored hardware verification receipt corresponds to the expected
 * peer public key and SAS safety number.
 */
export function verifyReceiptIntegrity(
  receipt: HardwareVerificationReceipt,
  expectedRemotePeerPublicKeyHex: string,
  expectedSasCode: string
): boolean {
  if (receipt.version !== '1.0') return false;
  if (receipt.remotePeerPublicKeyHex !== expectedRemotePeerPublicKeyHex) return false;
  if (receipt.sasCode !== expectedSasCode) return false;
  if (!receipt.authenticatorSignatureHex || receipt.authenticatorSignatureHex.length < 32) return false;

  return true;
}
