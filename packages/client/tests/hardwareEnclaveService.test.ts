import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HardwareEnclaveService } from '../src/services/hardwareEnclaveService.js';
import { EnclaveKeyManager } from '@aegis/crypto';

describe('Aegis HardwareEnclaveService', () => {
  beforeEach(() => {
    (HardwareEnclaveService as any).instance = null;
    delete (globalThis as any).window?.__TAURI_INTERNALS__;
    delete (globalThis as any).window?.__TAURI__;
    EnclaveKeyManager.unregisterHardwareDriver('apple-sep');
    EnclaveKeyManager.unregisterHardwareDriver('tpm2');
  });

  afterEach(() => {
    (HardwareEnclaveService as any).instance = null;
    delete (globalThis as any).window?.__TAURI_INTERNALS__;
    delete (globalThis as any).window?.__TAURI__;
    EnclaveKeyManager.unregisterHardwareDriver('apple-sep');
    EnclaveKeyManager.unregisterHardwareDriver('tpm2');
  });

  it('should initialize with software fallback in standard browser environment', async () => {
    const service = HardwareEnclaveService.getInstance();
    const status = await service.initialize();

    expect(status.isTauri).toBe(false);
    expect(status.isHardwareBacked).toBe(false);
    expect(status.enclaveType).toBe('software-fallback');
    expect(service.getStatus()).toEqual(status);
  });

  it('should detect native Tauri hardware enclave and register driver in EnclaveKeyManager', async () => {
    // Mock Tauri runtime
    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).window.__TAURI_INTERNALS__ = {};
    (globalThis as any).window.__TAURI__ = {
      core: {
        invoke: vi.fn().mockResolvedValue({
          has_secure_enclave: true,
          enclave_type: 'apple-sep',
          chip_identifier: 'Apple Silicon SEP (Secure Enclave Processor)',
          hardware_backed: true,
        }),
      },
    };

    const service = HardwareEnclaveService.getInstance();
    const status = await service.initialize();

    expect(status.isTauri).toBe(true);
    expect(status.isHardwareBacked).toBe(true);
    expect(status.enclaveType).toBe('apple-sep');
    expect(status.chipIdentifier).toContain('Apple Silicon SEP');

    // Verify driver was registered with EnclaveKeyManager
    expect(EnclaveKeyManager.isHardwareSiliconAvailable('apple-sep')).toBe(true);

    const key = EnclaveKeyManager.generateEnclaveKeyPair('apple-sep');
    expect(key.hardwareBacked).toBe(true);
    expect(key.isEmulated).toBe(false);
    expect(key.driver).toBe('tauri-native-apple-sep');
  });
});
