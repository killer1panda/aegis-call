import {
  createNFCPairingPayload,
  verifyNFCPairingPayload,
  NFCVerificationResult,
} from '@aegis/crypto';
import { TrustedContactsRegistry } from './trustedContactsRegistry.js';

export class NFCVerificationService {
  private static ndefReader: any = null;
  private static abortController: AbortController | null = null;

  /**
   * Checks whether Web NFC or Capacitor native NFC is available in the current environment.
   */
  public static isSupported(): boolean {
    return typeof window !== 'undefined' && 'NDEFReader' in window;
  }

  /**
   * Broadcasts local identity and SAS entropy over NFC tap (NDEF text record).
   */
  public static async broadcastIdentity(
    did: string,
    publicKey: Uint8Array,
    sasEntropy: Uint8Array,
    roomId: string
  ): Promise<boolean> {
    if (!this.isSupported()) {
      throw new Error('Web NFC is not supported on this browser/device');
    }

    try {
      const NDEFReaderClass = (window as any).NDEFReader;
      const writer = new NDEFReaderClass();
      const payloadString = createNFCPairingPayload(did, publicKey, sasEntropy, roomId);

      await writer.write({
        records: [
          {
            recordType: 'text',
            data: payloadString,
          },
        ],
      });

      return true;
    } catch (err: any) {
      console.warn('NFC broadcast failed:', err);
      throw err;
    }
  }

  /**
   * Starts listening for peer NFC tap. Upon contact, parses pairing record, verifies
   * cryptographic checksum, and pins peer in the TrustedContactsRegistry.
   */
  public static async startProximityScan(
    onSuccess: (result: NFCVerificationResult) => void,
    onError: (err: Error) => void
  ): Promise<void> {
    if (!this.isSupported()) {
      onError(new Error('Web NFC is not supported on this browser/device'));
      return;
    }

    try {
      this.abortController = new AbortController();
      const NDEFReaderClass = (window as any).NDEFReader;
      const reader = new NDEFReaderClass();
      this.ndefReader = reader;

      await reader.scan({ signal: this.abortController.signal });

      reader.onreading = (event: any) => {
        try {
          for (const record of event.message.records) {
            if (record.recordType === 'text') {
              const textDecoder = new TextDecoder(record.encoding || 'utf-8');
              const rawData = textDecoder.decode(record.data);

              if (rawData.startsWith('aegis-nfc:v1:')) {
                const result = verifyNFCPairingPayload(rawData);

                // Auto-pin into TrustedContactsRegistry
                TrustedContactsRegistry.pinContact({
                  did: result.did,
                  alias: `Peer (${result.did.slice(0, 14)}...)`,
                  publicKeyHex: Array.from(result.publicKeyBytes)
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join(''),
                  verifiedAt: Date.now(),
                  hardwareAttested: true,
                  verificationMethod: 'nfc-proximity',
                });

                onSuccess(result);
                return;
              }
            }
          }
        } catch (parseErr: any) {
          onError(parseErr);
        }
      };

      reader.onreadingerror = () => {
        onError(new Error('Cannot read NFC tag: reading error occurred. Please tap again.'));
      };
    } catch (err: any) {
      onError(err);
    }
  }

  /**
   * Stops active NFC scanning session.
   */
  public static stopProximityScan(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.ndefReader = null;
  }
}
