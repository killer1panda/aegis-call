import { describe, it, expect } from 'vitest';
import {
  createNFCPairingPayload,
  verifyNFCPairingPayload,
} from '../src/nfcPairing.js';
import { generateEphemeralKeyPair } from '../src/keyExchange.js';

describe('NFC Proximity Pairing & Out-of-Band Attestation', () => {
  it('should serialize and authenticate valid NFC pairing payloads with integrity verification', () => {
    const kp = generateEphemeralKeyPair();
    const sasEntropy = new Uint8Array(32).fill(7);
    const did = 'did:key:z6Mku7zP8hG...';
    const roomId = 'secure-summit-7701';

    const payload = createNFCPairingPayload(did, kp.publicKey, sasEntropy, roomId);
    expect(payload.startsWith('aegis-nfc:v1:')).toBe(true);

    const res = verifyNFCPairingPayload(payload);
    expect(res.valid).toBe(true);
    expect(res.did).toBe(did);
    expect(res.roomId).toBe(roomId);
    expect(res.publicKeyBytes).toEqual(kp.publicKey);
    expect(res.sasEntropyBytes).toEqual(sasEntropy);
    expect(res.ageMs).toBeGreaterThanOrEqual(0);
    expect(res.ageMs).toBeLessThan(5000);
  });

  it('should reject tampered payload checksums', () => {
    const kp = generateEphemeralKeyPair();
    const sasEntropy = new Uint8Array(32).fill(42);
    const payload = createNFCPairingPayload('did:key:test', kp.publicKey, sasEntropy, 'room-1');

    // Corrupt the checksum tag
    const parts = payload.split(':');
    parts[3] = '0000000000000000';
    const tampered = parts.join(':');

    expect(() => verifyNFCPairingPayload(tampered)).toThrow(/checksum mismatch/i);
  });

  it('should reject malformed or non-NFC headers', () => {
    expect(() => verifyNFCPairingPayload('malicious-token:v1:data:digest')).toThrow(
      /missing aegis-nfc prefix/i
    );
  });
});
