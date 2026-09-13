import { describe, it, expect, beforeEach } from 'vitest';
import { TrustedContactsRegistry } from '../src/services/trustedContactsRegistry.js';

// Ensure global localStorage exists in Node test environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('AegisCall Trusted Contacts & Hardware Attestation Registry', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('should pin a new trusted contact with hardware attestation receipt', () => {
    const dummyPkHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    TrustedContactsRegistry.pinContact({
      did: 'did:key:z6MkhaXgBZDvotDkL5257faiz48Z8xG855C4U9p',
      alias: 'Security Officer Alice',
      publicKeyHex: dummyPkHex,
      verifiedAt: Date.now(),
      hardwareAttested: true,
      verificationMethod: 'nfc-proximity',
    });

    const contact = TrustedContactsRegistry.getTrustedContact(dummyPkHex);
    expect(contact).not.toBeNull();
    expect(contact?.displayName).toBe('Security Officer Alice');
    expect(contact?.verifiedPublicKeyHex.toLowerCase()).toBe(dummyPkHex.toLowerCase());
    expect(contact?.hardwareReceipt).toBeDefined();
    expect(contact?.hardwareReceipt.authenticatorType).toBe('fido2-hardware-token');
  });

  it('should list all stored trusted contacts', () => {
    const pk1 = '1111111111111111111111111111111111111111111111111111111111111111';
    const pk2 = '2222222222222222222222222222222222222222222222222222222222222222';

    TrustedContactsRegistry.pinContact({ publicKeyHex: pk1, alias: 'Contact 1' });
    TrustedContactsRegistry.pinContact({ publicKeyHex: pk2, alias: 'Contact 2' });

    const list = TrustedContactsRegistry.listTrustedContacts();
    expect(list.length).toBe(2);
    const aliases = list.map((c) => c.displayName);
    expect(aliases).toContain('Contact 1');
    expect(aliases).toContain('Contact 2');
  });

  it('should remove trusted contacts cleanly by public key hex', () => {
    const pk = '3333333333333333333333333333333333333333333333333333333333333333';
    TrustedContactsRegistry.pinContact({ publicKeyHex: pk, alias: 'Temporary Peer' });
    expect(TrustedContactsRegistry.getTrustedContact(pk)).not.toBeNull();

    const deleted = TrustedContactsRegistry.removeTrustedContact(pk);
    expect(deleted).toBe(true);
    expect(TrustedContactsRegistry.getTrustedContact(pk)).toBeNull();
  });

  it('should return unverified status for unknown peer public keys', () => {
    const unknownPk = '9999999999999999999999999999999999999999999999999999999999999999';
    const status = TrustedContactsRegistry.verifyPeerStatus(unknownPk, '123456');
    expect(status.isTrusted).toBe(false);
    expect(status.receipt).toBeUndefined();
  });
});
