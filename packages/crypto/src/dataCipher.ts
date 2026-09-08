import { EncryptedMessagePayload } from './types.js';

export class DataCipher {
  private cryptoKey: CryptoKey | null = null;
  private rawKey: Uint8Array;
  private localFingerprint: string;

  constructor(key: Uint8Array, localFingerprint: string) {
    this.rawKey = key;
    this.localFingerprint = localFingerprint;
  }

  private async getKey(): Promise<CryptoKey> {
    if (!this.cryptoKey) {
      this.cryptoKey = await globalThis.crypto.subtle.importKey(
        'raw',
        this.rawKey as unknown as BufferSource,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
    }
    return this.cryptoKey;
  }

  public async encryptMessage(plaintext: string): Promise<EncryptedMessagePayload> {
    const key = await this.getKey();
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encodedText = new TextEncoder().encode(plaintext);

    const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
      },
      key,
      encodedText as unknown as BufferSource
    );

    return {
      iv: bufferToBase64(iv),
      ciphertext: bufferToBase64(new Uint8Array(ciphertextBuffer)),
      senderFingerprint: this.localFingerprint,
      timestamp: Date.now(),
    };
  }

  public async decryptMessage(payload: EncryptedMessagePayload): Promise<string> {
    const key = await this.getKey();
    const iv = base64ToBuffer(payload.iv);
    const ciphertext = base64ToBuffer(payload.ciphertext);

    const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
      },
      key,
      ciphertext as unknown as BufferSource
    );

    return new TextDecoder().decode(decryptedBuffer);
  }
}

function bufferToBase64(buf: Uint8Array): string {
  let binary = '';
  const len = buf.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
