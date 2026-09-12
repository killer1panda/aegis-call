export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  publicKeyHex: string;
}

export interface DerivedSessionKeys {
  audioKey: Uint8Array;
  videoKey: Uint8Array;
  dataKey: Uint8Array;
  ivBase: Uint8Array;
  sasEntropy: Uint8Array;
}

export interface DirectionalSessionKeys {
  sendAudioKey: Uint8Array;
  sendVideoKey: Uint8Array;
  sendDataKey: Uint8Array;
  sendIvBase: Uint8Array;
  recvAudioKey: Uint8Array;
  recvVideoKey: Uint8Array;
  recvDataKey: Uint8Array;
  recvIvBase: Uint8Array;
  sasEntropy: Uint8Array;
  role: 'initiator' | 'responder';
}


export interface SASVerification {
  numericCode: string; // 60-digit formatted as 12 groups of 5 digits
  emojis: string[];    // 4 distinct emojis for rapid verbal verification
  hexFingerprint: string; // Formatted SHA-256 fingerprint
}

export interface FrameCipherStats {
  framesEncrypted: number;
  framesDecrypted: number;
  bytesProcessed: number;
  lastLatencyMicros: number;
  averageLatencyMicros: number;
  droppedOrCorruptFrames: number;
}

export interface EncryptedMessagePayload {
  iv: string; // base64
  ciphertext: string; // base64
  senderFingerprint: string;
  timestamp: number;
}
