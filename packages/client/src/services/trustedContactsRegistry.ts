import { TrustedContactEntry, HardwareVerificationReceipt, verifyReceiptIntegrity } from '@aegis/crypto';

const STORAGE_KEY = 'aegis_trusted_contacts_registry_v1';

export class TrustedContactsRegistry {
  private static loadAll(): Map<string, TrustedContactEntry> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Map();
      const list: TrustedContactEntry[] = JSON.parse(raw);
      const map = new Map<string, TrustedContactEntry>();
      for (const item of list) {
        map.set(item.verifiedPublicKeyHex.toLowerCase(), item);
      }
      return map;
    } catch {
      return new Map();
    }
  }

  private static persist(map: Map<string, TrustedContactEntry>): void {
    try {
      const list = Array.from(map.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
      console.error('Failed to persist trusted contacts:', err);
    }
  }

  public static saveTrustedContact(entry: TrustedContactEntry): void {
    const map = this.loadAll();
    map.set(entry.verifiedPublicKeyHex.toLowerCase(), entry);
    this.persist(map);
  }

  public static getTrustedContact(publicKeyHex: string): TrustedContactEntry | null {
    const map = this.loadAll();
    return map.get(publicKeyHex.toLowerCase()) ?? null;
  }

  public static listTrustedContacts(): TrustedContactEntry[] {
    return Array.from(this.loadAll().values());
  }

  public static removeTrustedContact(publicKeyHex: string): boolean {
    const map = this.loadAll();
    const deleted = map.delete(publicKeyHex.toLowerCase());
    if (deleted) this.persist(map);
    return deleted;
  }

  public static verifyPeerStatus(
    publicKeyHex: string,
    currentSasCode: string
  ): { isTrusted: boolean; receipt?: HardwareVerificationReceipt } {
    const contact = this.getTrustedContact(publicKeyHex);
    if (!contact) return { isTrusted: false };

    const isValid = verifyReceiptIntegrity(
      contact.hardwareReceipt,
      publicKeyHex,
      currentSasCode
    );

    return {
      isTrusted: isValid,
      receipt: contact.hardwareReceipt,
    };
  }
}
