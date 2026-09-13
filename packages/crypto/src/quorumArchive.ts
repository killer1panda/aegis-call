import {
  splitSecret,
  reconstructSecret,
  ShamirShare,
  formatShareString,
  parseShareString,
} from './shamir.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export interface QuorumEncryptedArchive {
  archiveId: string;
  roomId: string;
  timestamp: number;
  thresholdM: number;
  totalCustodiansN: number;
  ivHex: string;
  ciphertextBase64: string;
}

export class QuorumCallArchive {
  /**
   * Encrypts a call recording with a client-side ephemeral master key, then splits
   * the master key into N Shamir polynomial shares with threshold M.
   * No single individual or server possesses the decryption key.
   */
  public static async encryptArchive(
    recordingData: Uint8Array,
    roomId: string,
    thresholdM: number = 3,
    totalCustodiansN: number = 5
  ): Promise<{ archive: QuorumEncryptedArchive; shares: string[] }> {
    if (thresholdM > totalCustodiansN || thresholdM < 2) {
      throw new Error(`Invalid threshold quorum: M must be >= 2 and <= N`);
    }

    // 1. Generate ephemeral 256-bit symmetric master key
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 2. Encrypt recording data using AES-256-GCM
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      masterKey as unknown as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      cryptoKey,
      recordingData as unknown as BufferSource
    );

    // 3. Split master key into N shares with threshold M using Shamir GF(2^8)
    const rawShares = splitSecret(masterKey, totalCustodiansN, thresholdM);
    const armoredShares = rawShares.map((s) => formatShareString(s));

    const archiveId = `archive-${Date.now()}-${bytesToHex(crypto.getRandomValues(new Uint8Array(8)))}`;

    const archive: QuorumEncryptedArchive = {
      archiveId,
      roomId,
      timestamp: Date.now(),
      thresholdM,
      totalCustodiansN,
      ivHex: bytesToHex(iv),
      ciphertextBase64: Buffer.from(new Uint8Array(ciphertextBuffer)).toString('base64'),
    };

    // Zeroize master key in volatile memory
    masterKey.fill(0);

    return { archive, shares: armoredShares };
  }

  /**
   * Reconstructs master key from M valid custodian shares and decrypts the archive.
   */
  public static async decryptArchive(
    archive: QuorumEncryptedArchive,
    custodianShares: (ShamirShare | string)[]
  ): Promise<Uint8Array> {
    if (custodianShares.length < archive.thresholdM) {
      throw new Error(
        `Insufficient quorum: provided ${custodianShares.length} shares, strictly requires ${archive.thresholdM}`
      );
    }

    // Parse and validate shares
    const parsedShares: ShamirShare[] = custodianShares.map((s) =>
      typeof s === 'string' ? parseShareString(s) : s
    );

    // 1. Reconstruct master key using Lagrange polynomial interpolation over GF(2^8)
    const reconstructedKey = reconstructSecret(parsedShares);
    if (reconstructedKey.length !== 32) {
      throw new Error('Master key reconstruction failed: invalid key length');
    }

    // 2. Decrypt archive ciphertext
    const iv = hexToBytes(archive.ivHex);
    const ciphertextBytes = new Uint8Array(Buffer.from(archive.ciphertextBase64, 'base64'));

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      reconstructedKey as unknown as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    try {
      const plaintextBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        cryptoKey,
        ciphertextBytes as unknown as BufferSource
      );
      return new Uint8Array(plaintextBuffer);
    } finally {
      // Zeroize reconstructed key from volatile memory
      reconstructedKey.fill(0);
    }
  }
}
