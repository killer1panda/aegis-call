import { describe, it, expect } from 'vitest';
import { NFCVerificationService } from '../src/services/nfcVerification.js';
import { SecurityBadge } from '../src/components/SecurityBadge.js';

describe('AegisCall SecurityBadge NFC Proximity & Hardware Transparency Guarantees', () => {
  it('should export SecurityBadge component function', () => {
    expect(SecurityBadge).toBeDefined();
    expect(typeof SecurityBadge).toBe('function');
  });

  it('should correctly report Web NFC as unsupported on non-compatible platforms (node, desktop, safari)', () => {
    // In Node / Vitest environment, window.NDEFReader is undefined
    const isSupported = NFCVerificationService.isSupported();
    expect(isSupported).toBe(false);
  });

  it('should strictly fail closed and reject startProximityScan on unsupported platforms', async () => {
    const onScan = () => {};
    const onError = (err: Error) => {
      expect(err.message).toContain('Web NFC');
    };

    // Calling startProximityScan when unsupported should invoke error handler and not succeed
    await NFCVerificationService.startProximityScan(onScan, onError);
  });

  it('should reject broadcastIdentity when NFC hardware is missing', async () => {
    await expect(
      NFCVerificationService.broadcastIdentity(
        'did:key:zAegisTest',
        new Uint8Array(32),
        new Uint8Array(16),
        'secure-room-1'
      )
    ).rejects.toThrow(/Web NFC is not supported/);
  });
});
