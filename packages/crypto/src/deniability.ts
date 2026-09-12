import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { hkdf } from '@noble/hashes/hkdf';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export interface DeniableMessagePayload {
  version: 'aegis-otr-v1';
  senderId: string;
  timestamp: number;
  nonceHex: string;
  ciphertextHex: string;
  macHex: string;
}

export interface DeniableKeys {
  encKey: Uint8Array;
  macKey: Uint8Array;
}

/**
 * Derives symmetric encryption and authentication keys from a shared Diffie-Hellman secret.
 */
export function deriveDeniableKeys(sharedSecret: Uint8Array, contextInfo: string = 'aegis-deniable-v1'): DeniableKeys {
  const encKey = hkdf(sha256, sharedSecret, new Uint8Array(32), new TextEncoder().encode(`${contextInfo}:enc`), 32);
  const macKey = hkdf(sha256, sharedSecret, new Uint8Array(32), new TextEncoder().encode(`${contextInfo}:mac`), 32);
  return { encKey, macKey };
}

/**
 * Encrypts and authenticates a message with symmetric HMAC.
 * During the active call, Bob is 100% certain Alice sent it (as he knows he didn't write it).
 * Post-call, Bob cannot prove to any third party that Alice authored it, as Bob possesses the same MAC key.
 */
export async function createDeniableMessage(
  plaintext: string,
  sharedSecret: Uint8Array,
  senderId: string
): Promise<DeniableMessagePayload> {
  const { encKey, macKey } = deriveDeniableKeys(sharedSecret);
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const timestamp = Date.now();

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encKey as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const ciphertextBuf = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as unknown as BufferSource },
    cryptoKey,
    new TextEncoder().encode(plaintext) as unknown as BufferSource
  );

  const ciphertextBytes = new Uint8Array(ciphertextBuf);
  const authenticatedData = new TextEncoder().encode(`${senderId}:${timestamp}:${bytesToHex(nonce)}:${bytesToHex(ciphertextBytes)}`);
  const mac = hmac(sha256, macKey, authenticatedData);

  return {
    version: 'aegis-otr-v1',
    senderId,
    timestamp,
    nonceHex: bytesToHex(nonce),
    ciphertextHex: bytesToHex(ciphertextBytes),
    macHex: bytesToHex(mac),
  };
}

/**
 * Verifies and decrypts a deniable message using the shared secret.
 */
export async function verifyAndDecryptDeniableMessage(
  payload: DeniableMessagePayload,
  sharedSecret: Uint8Array
): Promise<{ valid: boolean; plaintext?: string; reason?: string }> {
  if (payload.version !== 'aegis-otr-v1') {
    return { valid: false, reason: 'Unsupported deniable protocol version' };
  }

  const { encKey, macKey } = deriveDeniableKeys(sharedSecret);
  const nonce = hexToBytes(payload.nonceHex);
  const ciphertextBytes = hexToBytes(payload.ciphertextHex);

  // 1. Verify symmetric MAC
  const authenticatedData = new TextEncoder().encode(`${payload.senderId}:${payload.timestamp}:${payload.nonceHex}:${payload.ciphertextHex}`);
  const expectedMac = hmac(sha256, macKey, authenticatedData);

  const macBytes = hexToBytes(payload.macHex);
  if (macBytes.length !== expectedMac.length) {
    return { valid: false, reason: 'Invalid MAC length' };
  }

  let diff = 0;
  for (let i = 0; i < macBytes.length; i++) {
    diff |= macBytes[i] ^ expectedMac[i];
  }
  if (diff !== 0) {
    return { valid: false, reason: 'MAC verification failed (tampered or forged by untrusted party)' };
  }

  // 2. Decrypt ciphertext
  try {
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      encKey as unknown as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const plaintextBuf = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce as unknown as BufferSource },
      cryptoKey,
      ciphertextBytes as unknown as BufferSource
    );

    return { valid: true, plaintext: new TextDecoder().decode(plaintextBuf) };
  } catch (err: any) {
    return { valid: false, reason: `Decryption error: ${err.message || 'unknown'}` };
  }
}

/**
 * Demonstrates cryptographic forgeability:
 * Given the shared secret (or disclosed MAC key), ANY participant can fabricate a cryptographically
 * valid message with any sender identity and arbitrary timestamp, providing legal deniability.
 */
export async function forgeDeniableMessage(
  forgedPlaintext: string,
  sharedSecret: Uint8Array,
  impersonatedSenderId: string,
  forgedTimestamp: number
): Promise<DeniableMessagePayload> {
  const { encKey, macKey } = deriveDeniableKeys(sharedSecret);
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encKey as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const ciphertextBuf = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as unknown as BufferSource },
    cryptoKey,
    new TextEncoder().encode(forgedPlaintext) as unknown as BufferSource
  );

  const ciphertextBytes = new Uint8Array(ciphertextBuf);
  const authenticatedData = new TextEncoder().encode(`${impersonatedSenderId}:${forgedTimestamp}:${bytesToHex(nonce)}:${bytesToHex(ciphertextBytes)}`);
  const mac = hmac(sha256, macKey, authenticatedData);

  return {
    version: 'aegis-otr-v1',
    senderId: impersonatedSenderId,
    timestamp: forgedTimestamp,
    nonceHex: bytesToHex(nonce),
    ciphertextHex: bytesToHex(ciphertextBytes),
    macHex: bytesToHex(mac),
  };
}
