import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export interface PinConfig {
  saltHex: string;
  masterHashHex: string;
  duressHashHex: string;
  isCustom: boolean;
  updatedAt: number;
}

const STORAGE_KEY = 'aegis_pin_security_v1';
const DEFAULT_SALT = 'aegis_default_salt_2026';
const DEFAULT_SALT_HEX = bytesToHex(new TextEncoder().encode(DEFAULT_SALT));
const DEFAULT_MASTER_PIN = '1337';
const DEFAULT_DURESS_PIN = '9999';

function computeHash(pin: string, salt: string): string {
  const data = new TextEncoder().encode(`${salt}:${pin.trim()}`);
  return bytesToHex(sha256(data));
}

export class PinSecurityService {
  private static instance: PinSecurityService | null = null;
  private memoryConfig: PinConfig;

  private constructor() {
    this.memoryConfig = this.loadConfig();
  }

  public static getInstance(): PinSecurityService {
    if (!PinSecurityService.instance) {
      PinSecurityService.instance = new PinSecurityService();
    }
    return PinSecurityService.instance;
  }

  private getDefaultConfig(): PinConfig {
    return {
      saltHex: DEFAULT_SALT_HEX,
      masterHashHex: computeHash(DEFAULT_MASTER_PIN, DEFAULT_SALT_HEX),
      duressHashHex: computeHash(DEFAULT_DURESS_PIN, DEFAULT_SALT_HEX),
      isCustom: false,
      updatedAt: Date.now(),
    };
  }

  private loadConfig(): PinConfig {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.saltHex && parsed.masterHashHex && parsed.duressHashHex) {
            return parsed;
          }
        }
      } catch (err) {
        console.warn('[PinSecurity] Failed to load PIN config from storage, using defaults:', err);
      }
    }
    return this.getDefaultConfig();
  }

  private saveConfig(config: PinConfig): void {
    this.memoryConfig = config;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      } catch (err) {
        console.warn('[PinSecurity] Failed to persist PIN config:', err);
      }
    }
  }

  public isCustomized(): boolean {
    return this.memoryConfig.isCustom;
  }

  /**
   * Verifies an input PIN against configured Master and Duress credentials
   */
  public verifyPin(pin: string): { status: 'master' | 'duress' | 'invalid' } {
    if (!pin || pin.trim().length < 4) {
      return { status: 'invalid' };
    }

    const salt = this.memoryConfig.saltHex;
    const inputHash = computeHash(pin, salt);

    if (inputHash === this.memoryConfig.masterHashHex) {
      return { status: 'master' };
    }

    if (inputHash === this.memoryConfig.duressHashHex) {
      return { status: 'duress' };
    }

    // Also support fallback default master PIN '0000' for quick emergency test
    if (!this.memoryConfig.isCustom && pin === '0000') {
      return { status: 'master' };
    }

    return { status: 'invalid' };
  }

  /**
   * User setup: configure custom Master PIN and Duress PIN
   */
  public updatePins(
    currentMasterPin: string,
    newMasterPin: string,
    newDuressPin: string
  ): { success: boolean; error?: string } {
    // 1. Verify current master PIN
    const verification = this.verifyPin(currentMasterPin);
    if (verification.status !== 'master') {
      return { success: false, error: 'Current Master PIN is incorrect' };
    }

    // 2. Validate new Master PIN
    const cleanMaster = newMasterPin.replace(/\D/g, '');
    if (cleanMaster.length < 4 || cleanMaster.length > 8) {
      return { success: false, error: 'New Master PIN must be between 4 and 8 digits' };
    }

    // 3. Validate new Duress PIN
    const cleanDuress = newDuressPin.replace(/\D/g, '');
    if (cleanDuress.length < 4 || cleanDuress.length > 8) {
      return { success: false, error: 'New Duress PIN must be between 4 and 8 digits' };
    }

    // 4. Collision prevention: Master and Duress PINs cannot be identical
    if (cleanMaster === cleanDuress) {
      return { success: false, error: 'Master PIN and Duress PIN must be different' };
    }

    // 5. Generate fresh random salt
    let newSaltBytes = new Uint8Array(16);
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(newSaltBytes);
    } else {
      for (let i = 0; i < 16; i++) newSaltBytes[i] = Math.floor(Math.random() * 256);
    }
    const newSaltHex = bytesToHex(newSaltBytes);

    const masterHashHex = computeHash(cleanMaster, newSaltHex);
    const duressHashHex = computeHash(cleanDuress, newSaltHex);

    const newConfig: PinConfig = {
      saltHex: newSaltHex,
      masterHashHex,
      duressHashHex,
      isCustom: true,
      updatedAt: Date.now(),
    };

    this.saveConfig(newConfig);
    return { success: true };
  }

  /**
   * Reset PINs to initial defaults (1337 / 9999)
   */
  public resetToDefaults(): void {
    const defaultConfig = this.getDefaultConfig();
    this.saveConfig(defaultConfig);
  }
}
