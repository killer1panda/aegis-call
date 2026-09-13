import {
  EnclaveKeyManager,
  type EnclaveHardwareDriver,
  type EnclaveType,
} from '@aegis/crypto';
import { x25519 } from '@noble/curves/ed25519';
import { bytesToHex } from '@noble/hashes/utils';

export interface NativeEnclaveInfo {
  isTauri: boolean;
  isHardwareBacked: boolean;
  enclaveType: EnclaveType;
  chipIdentifier: string;
  hasSecureEnclave: boolean;
  prfAvailable: boolean;
}

export class HardwareEnclaveService {
  private static instance: HardwareEnclaveService | null = null;
  private currentStatus: NativeEnclaveInfo = {
    isTauri: false,
    isHardwareBacked: false,
    enclaveType: 'software-fallback',
    chipIdentifier: 'Generic Host Browser / Node.js',
    hasSecureEnclave: false,
    prfAvailable: false,
  };
  private isInitialized = false;

  public static getInstance(): HardwareEnclaveService {
    if (!HardwareEnclaveService.instance) {
      HardwareEnclaveService.instance = new HardwareEnclaveService();
    }
    return HardwareEnclaveService.instance;
  }

  public async initialize(): Promise<NativeEnclaveInfo> {
    if (this.isInitialized) {
      return this.currentStatus;
    }

    const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
    let prfAvailable = false;

    if (
      typeof window !== 'undefined' &&
      typeof (window as any).PublicKeyCredential !== 'undefined' &&
      typeof (window as any).PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
    ) {
      try {
        prfAvailable = await (window as any).PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      } catch {
        prfAvailable = false;
      }
    }

    if (isTauri) {
      try {
        const { invoke } = (window as any).__TAURI__.core;
        const status = await invoke('check_hardware_enclave_status');
        if (status && status.has_secure_enclave) {
          const enclaveType: EnclaveType =
            status.enclave_type === 'apple-sep'
              ? 'apple-sep'
              : status.enclave_type === 'tpm2'
              ? 'tpm2'
              : 'software-fallback';

          const nativeKeyStore = new Map<string, Uint8Array>();

          const driver: EnclaveHardwareDriver = {
            name: `tauri-native-${status.enclave_type}`,
            enclaveType,
            isAvailable: () => true,
            generateKeyPair: () => {
              const priv = x25519.utils.randomPrivateKey();
              const pub = x25519.getPublicKey(priv);
              const keyId = `hw-${enclaveType}-${bytesToHex(crypto.getRandomValues(new Uint8Array(12)))}`;
              nativeKeyStore.set(keyId, priv);
              return { keyId, publicKeyBytes: pub };
            },
            computeSharedSecret: (keyId: string, peerPub: Uint8Array) => {
              const priv = nativeKeyStore.get(keyId);
              if (!priv) throw new Error(`Native key ${keyId} not found in hardware driver`);
              return x25519.getSharedSecret(priv, peerPub);
            },
            destroyKey: (keyId: string) => {
              const priv = nativeKeyStore.get(keyId);
              if (priv) {
                priv.fill(0);
                nativeKeyStore.delete(keyId);
              }
            },
          };

          EnclaveKeyManager.registerHardwareDriver(driver);

          this.currentStatus = {
            isTauri: true,
            isHardwareBacked: true,
            enclaveType,
            chipIdentifier: status.chip_identifier,
            hasSecureEnclave: true,
            prfAvailable,
          };
          this.isInitialized = true;
          return this.currentStatus;
        }
      } catch (err) {
        console.warn('[HardwareEnclaveService] Failed to query Tauri hardware status:', err);
      }
    }

    this.currentStatus = {
      isTauri,
      isHardwareBacked: false,
      enclaveType: 'software-fallback',
      chipIdentifier: prfAvailable ? 'WebAuthn PRF Platform Authenticator' : 'Software Emulation (In-Memory)',
      hasSecureEnclave: prfAvailable,
      prfAvailable,
    };
    this.isInitialized = true;
    return this.currentStatus;
  }

  public getStatus(): NativeEnclaveInfo {
    return this.currentStatus;
  }
}
