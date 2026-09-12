import { describe, it, expect } from 'vitest';
import {
  createCanonicalSASPayload,
  generateAuthChallenge,
  issueHardwareReceipt,
  verifyReceiptIntegrity,
} from '../src/webAuthn.js';

describe('Hardware-Backed Identity & WebAuthn Verification', () => {
  it('should generate canonical SAS payload for hardware signing', () => {
    const payload1 = createCanonicalSASPayload('84920 19304 88291', '0xdeadbeef', 'room-alpha');
    const payload2 = createCanonicalSASPayload('84920 19304 88291', '0xdeadbeef', 'room-alpha');
    const payloadDiff = createCanonicalSASPayload('99999 19304 88291', '0xdeadbeef', 'room-alpha');

    expect(payload1.length).toBe(32);
    expect(Buffer.from(payload1).equals(Buffer.from(payload2))).toBe(true);
    expect(Buffer.from(payload1).equals(Buffer.from(payloadDiff))).toBe(false);
  });

  it('should generate unique WebAuthn authentication challenges', () => {
    const challenge1 = generateAuthChallenge('room-1');
    const challenge2 = generateAuthChallenge('room-1');

    expect(challenge1.length).toBe(32);
    expect(challenge2.length).toBe(32);
    expect(Buffer.from(challenge1).equals(Buffer.from(challenge2))).toBe(false);
  });

  it('should issue and verify valid hardware verification receipts', () => {
    const roomId = 'room-prod-verify';
    const credentialId = 'cred-yubikey-fido2-9901';
    const peerPkHex = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const sasCode = '84920 19304 88291 00294';
    const signature = new Uint8Array(64).fill(0x7a);

    const receipt = issueHardwareReceipt(
      roomId,
      credentialId,
      peerPkHex,
      sasCode,
      signature,
      'apple-secure-enclave'
    );

    expect(receipt.version).toBe('1.0');
    expect(receipt.authenticatorType).toBe('apple-secure-enclave');
    expect(receipt.authenticatorSignatureHex.length).toBe(128); // 64 bytes in hex

    // Valid check
    const isValid = verifyReceiptIntegrity(receipt, peerPkHex, sasCode);
    expect(isValid).toBe(true);

    // Tampered SAS check
    const isInvalidSas = verifyReceiptIntegrity(receipt, peerPkHex, 'wrong-sas-code');
    expect(isInvalidSas).toBe(false);

    // Tampered Peer Public Key check
    const isInvalidPeer = verifyReceiptIntegrity(receipt, 'different-peer-pk', sasCode);
    expect(isInvalidPeer).toBe(false);
  });
});
