import { describe, it, expect } from 'vitest';
import {
  EnclaveKeyManager,
  createDeviceAttestation,
  verifyDeviceAttestation,
} from '../src/secureEnclave.js';
import { ed25519 } from '@noble/curves/ed25519';

describe('AegisCall Hardware Secure Enclave & Remote Attestation Subsystem', () => {
  it('should generate hardware-rooted ephemeral keys and compute ECDH shared secrets', () => {
    // Generate Alice enclave key (Apple SEP)
    const aliceKey = EnclaveKeyManager.generateEnclaveKeyPair('apple-sep');
    expect(aliceKey.keyId).toMatch(/^enclave-key-/);
    expect(aliceKey.publicKeyBytes).toHaveLength(32);
    expect(aliceKey.hardwareBacked).toBe(true);
    expect(aliceKey.enclaveType).toBe('apple-sep');

    // Generate Bob enclave key (Android StrongBox)
    const bobKey = EnclaveKeyManager.generateEnclaveKeyPair('android-strongbox');
    expect(bobKey.hardwareBacked).toBe(true);
    expect(bobKey.enclaveType).toBe('android-strongbox');

    // Compute shared secret inside enclaves
    const aliceSecret = EnclaveKeyManager.computeEnclaveSharedSecret(aliceKey.keyId, bobKey.publicKeyBytes);
    const bobSecret = EnclaveKeyManager.computeEnclaveSharedSecret(bobKey.keyId, aliceKey.publicKeyBytes);

    expect(aliceSecret).toHaveLength(32);
    expect(aliceSecret).toEqual(bobSecret);

    // Destroy enclave key
    EnclaveKeyManager.destroyEnclaveKey(aliceKey.keyId);
    expect(() =>
      EnclaveKeyManager.computeEnclaveSharedSecret(aliceKey.keyId, bobKey.publicKeyBytes)
    ).toThrow(/wiped from secure silicon/);
  });

  it('should create and verify valid Remote Device Attestation tokens', () => {
    const signerPrivateKey = ed25519.utils.randomPrivateKey();
    const signerPublicKey = ed25519.getPublicKey(signerPrivateKey);

    const nonce = 'fresh-challenge-nonce-12345';
    const buildHash = 'sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069';

    const attestation = createDeviceAttestation(
      {
        deviceId: 'device-iphone-15-pro',
        nonce,
        platform: 'ios',
        bootloaderLocked: true,
        debuggerAttached: false,
        integrityPassed: true,
        appBuildHash: buildHash,
      },
      signerPrivateKey
    );

    expect(attestation.signatureHex).toBeDefined();

    const verification = verifyDeviceAttestation(attestation, nonce, buildHash, signerPublicKey);
    expect(verification.valid).toBe(true);
    expect(verification.reason).toBeUndefined();
  });

  it('should detect and reject jailbroken / rooted devices or debugger tampering', () => {
    const signerPrivateKey = ed25519.utils.randomPrivateKey();
    const signerPublicKey = ed25519.getPublicKey(signerPrivateKey);
    const nonce = 'challenge-xyz';
    const buildHash = 'build-hash-official';

    // 1. Unlocked bootloader (rooted/jailbroken)
    const jailbrokenAttest = createDeviceAttestation(
      {
        deviceId: 'device-compromised-1',
        nonce,
        platform: 'android',
        bootloaderLocked: false, // Rooted!
        debuggerAttached: false,
        integrityPassed: true,
        appBuildHash: buildHash,
      },
      signerPrivateKey
    );
    const jbResult = verifyDeviceAttestation(jailbrokenAttest, nonce, buildHash, signerPublicKey);
    expect(jbResult.valid).toBe(false);
    expect(jbResult.reason).toContain('bootloader is unlocked');

    // 2. Debugger attached (e.g. Frida or ptrace)
    const debuggedAttest = createDeviceAttestation(
      {
        deviceId: 'device-hooked-2',
        nonce,
        platform: 'macos',
        bootloaderLocked: true,
        debuggerAttached: true, // Hooked!
        integrityPassed: true,
        appBuildHash: buildHash,
      },
      signerPrivateKey
    );
    const dbgResult = verifyDeviceAttestation(debuggedAttest, nonce, buildHash, signerPublicKey);
    expect(dbgResult.valid).toBe(false);
    expect(dbgResult.reason).toContain('Debugger or dynamic instrumentation hook attached');

    // 3. Stale replay nonce
    const freshAttest = createDeviceAttestation(
      {
        deviceId: 'device-valid',
        nonce: 'old-stale-nonce',
        platform: 'windows',
        bootloaderLocked: true,
        debuggerAttached: false,
        integrityPassed: true,
        appBuildHash: buildHash,
      },
      signerPrivateKey
    );
    const replayResult = verifyDeviceAttestation(freshAttest, 'expected-new-nonce', buildHash, signerPublicKey);
    expect(replayResult.valid).toBe(false);
    expect(replayResult.reason).toContain('nonce mismatch');
  });
});
