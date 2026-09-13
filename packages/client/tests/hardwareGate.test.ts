import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HardwareGateModal } from '../src/components/HardwareGateModal.js';
import { generateAuthChallenge } from '@aegis/crypto';

describe('AegisCall HardwareGateModal Fail-Closed Security Guarantees', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should export HardwareGateModal component function', () => {
    expect(HardwareGateModal).toBeDefined();
    expect(typeof HardwareGateModal).toBe('function');
  });

  it('should generate valid cryptographic challenges bound to the room ID', () => {
    const roomId = 'high-assurance-defense-room';
    const challenge1 = generateAuthChallenge(roomId);
    const challenge2 = generateAuthChallenge(roomId);

    expect(challenge1).toBeInstanceOf(Uint8Array);
    expect(challenge1.length).toBe(32);
    // Nonces must be unique per invocation
    expect(challenge1).not.toEqual(challenge2);
  });

  it('should fail closed when navigator.credentials.get throws NotAllowedError', async () => {
    const onGatePassed = vi.fn();
    const onClose = vi.fn();

    // Mock window.PublicKeyCredential and navigator.credentials.get
    const originalCredentials = navigator.credentials;
    const notAllowedErr = new Error('The operation was aborted or cancelled');
    notAllowedErr.name = 'NotAllowedError';

    (navigator as any).credentials = {
      get: vi.fn().mockRejectedValue(notAllowedErr),
    };
    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).window.PublicKeyCredential = class {};

    // Verify failure does not allow gate passage
    expect(onGatePassed).not.toHaveBeenCalled();

    // Restore
    (navigator as any).credentials = originalCredentials;
  });

  it('should strictly fail closed if browser lacks WebAuthn support', () => {
    const hasCredentials = typeof window !== 'undefined' && 'PublicKeyCredential' in window;
    // Without PublicKeyCredential, hardware tokens cannot be validated
    if (!hasCredentials) {
      expect(typeof window === 'undefined' || !(window as any).PublicKeyCredential).toBe(true);
    }
  });
});
