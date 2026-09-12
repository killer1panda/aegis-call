import {
  generateIdentityKeyPair,
  signCallRecordingAttestation,
  type CallRecordingAttestation,
} from '@aegis/crypto';

export interface LocalIdentity {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  did: string;
}

let cachedIdentity: LocalIdentity | null = null;

export const IdentityService = {
  getOrCreateIdentity(): LocalIdentity {
    if (cachedIdentity) return cachedIdentity;

    // Check sessionStorage to maintain consistent DID across page refreshes in the same tab
    try {
      const stored = sessionStorage.getItem('aegis_local_identity');
      if (stored) {
        const parsed = JSON.parse(stored);
        cachedIdentity = {
          publicKey: new Uint8Array(parsed.publicKey),
          privateKey: new Uint8Array(parsed.privateKey),
          did: parsed.did,
        };
        return cachedIdentity;
      }
    } catch {
      // Ignore storage errors and generate ephemeral
    }

    const generated = generateIdentityKeyPair();
    cachedIdentity = generated;

    try {
      sessionStorage.setItem(
        'aegis_local_identity',
        JSON.stringify({
          publicKey: Array.from(generated.publicKey),
          privateKey: Array.from(generated.privateKey),
          did: generated.did,
        })
      );
    } catch {
      // Ignore
    }

    return cachedIdentity;
  },

  signRecording(
    roomId: string,
    recordingSha256: string,
    durationSeconds: number,
    participants: string[]
  ): CallRecordingAttestation {
    const identity = this.getOrCreateIdentity();
    return signCallRecordingAttestation(
      identity.privateKey,
      identity.did,
      roomId,
      recordingSha256,
      durationSeconds,
      participants
    );
  },
};
