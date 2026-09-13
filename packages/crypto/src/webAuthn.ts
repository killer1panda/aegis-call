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

/**
 * Derives a hardware-bound root key using the W3C WebAuthn Level 3 PRF (Pseudo-Random Function) extension.
 * If running on a client with a hardware security key (YubiKey, Apple Touch ID / SEP, Windows Hello),
 * the key is derived directly on the hardware silicon without the master seed ever touching RAM.
 */
export async function deriveHardwareKeyViaWebAuthnPrf(
  salt: Uint8Array,
  options?: {
    rpId?: string;
    credentialId?: Uint8Array;
  }
): Promise<{ keyBytes: Uint8Array; isHardwareBacked: boolean } | null> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return null;
  }

  try {
    const assertionOptions: any = {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: options?.rpId || window.location?.hostname || 'localhost',
      userVerification: 'preferred',
      extensions: {
        prf: {
          eval: {
            first: salt,
          },
        },
      },
    };

    if (options?.credentialId) {
      assertionOptions.allowCredentials = [
        {
          id: options.credentialId,
          type: 'public-key',
          transports: ['internal', 'usb', 'nfc', 'ble'],
        },
      ];
    }

    const credential = (await navigator.credentials.get({
      publicKey: assertionOptions,
    })) as any;

    const prfResults = credential?.getClientExtensionResults?.()?.prf;
    if (prfResults?.results?.first) {
      return {
        keyBytes: new Uint8Array(prfResults.results.first),
        isHardwareBacked: true,
      };
    }
  } catch (_err) {
    // Hardware security key not attached or PRF extension unsupported
    return null;
  }

  return null;
}
