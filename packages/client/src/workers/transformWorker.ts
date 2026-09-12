import { SFrameCipher } from '@aegis/crypto';

// In Web Workers with WebRTC Encoded Transform, RTCTransformEvent is fired on global scope
declare const self: DedicatedWorkerGlobalScope & {
  onrtctransform?: (event: any) => void;
};

// Directional SFrame ciphers eliminating AES-GCM nonce reuse
let sendAudioCipher: SFrameCipher | null = null;
let recvAudioCipher: SFrameCipher | null = null;
let sendVideoCipher: SFrameCipher | null = null;
let recvVideoCipher: SFrameCipher | null = null;

self.onmessage = (event: MessageEvent) => {
  const data = event.data;

  if (data.type === 'init-ciphers') {
    // Support both directional keys and legacy fallback
    const sendAudioKey = data.sendAudioKey || data.audioKey;
    const recvAudioKey = data.recvAudioKey || data.audioKey;
    const sendVideoKey = data.sendVideoKey || data.videoKey;
    const recvVideoKey = data.recvVideoKey || data.videoKey;
    const sendIvBase = data.sendIvBase || data.ivBase;
    const recvIvBase = data.recvIvBase || data.ivBase;

    if (sendAudioKey && sendIvBase) {
      sendAudioCipher = new SFrameCipher(new Uint8Array(sendAudioKey), new Uint8Array(sendIvBase));
    }
    if (recvAudioKey && recvIvBase) {
      recvAudioCipher = new SFrameCipher(new Uint8Array(recvAudioKey), new Uint8Array(recvIvBase));
    }
    if (sendVideoKey && sendIvBase) {
      sendVideoCipher = new SFrameCipher(new Uint8Array(sendVideoKey), new Uint8Array(sendIvBase));
    }
    if (recvVideoKey && recvIvBase) {
      recvVideoCipher = new SFrameCipher(new Uint8Array(recvVideoKey), new Uint8Array(recvIvBase));
    }
    self.postMessage({ type: 'ciphers-ready' });
  }
};

/**
 * RTCRtpScriptTransform event handler
 */
if ('RTCRtpScriptTransform' in self || 'onrtctransform' in self) {
  self.onrtctransform = (event: any) => {
    const transformer = event.transformer;
    const { operation, kind } = transformer.options || {};

    const transformStream = new TransformStream({
      async transform(frame: any, controller: TransformStreamDefaultController) {
        const cipher =
          kind === 'audio'
            ? operation === 'encode'
              ? sendAudioCipher
              : recvAudioCipher
            : operation === 'encode'
              ? sendVideoCipher
              : recvVideoCipher;

        if (!cipher) {
          // If cipher not yet initialized, pass through
          controller.enqueue(frame);
          return;
        }

        try {
          const rawData = new Uint8Array(frame.data);

          if (operation === 'encode') {
            const encryptedData = await cipher.encryptFrame(rawData);
            frame.data = encryptedData.buffer;
          } else if (operation === 'decode') {
            const decryptedData = await cipher.decryptFrame(rawData);
            frame.data = decryptedData.buffer;
          }

          controller.enqueue(frame);
        } catch (err) {
          // Drop corrupt/replay frame safely
        }
      },
    });

    transformer.readable.pipeThrough(transformStream).pipeTo(transformer.writable);
  };
}

// Periodically report worker crypto stats to the main thread
setInterval(() => {
  if (sendAudioCipher || recvAudioCipher || sendVideoCipher || recvVideoCipher) {
    self.postMessage({
      type: 'crypto-stats',
      audio: {
        framesEncrypted: sendAudioCipher?.stats.framesEncrypted || 0,
        framesDecrypted: recvAudioCipher?.stats.framesDecrypted || 0,
        bytesProcessed:
          (sendAudioCipher?.stats.bytesProcessed || 0) +
          (recvAudioCipher?.stats.bytesProcessed || 0),
        lastLatencyMicros: Math.max(
          sendAudioCipher?.stats.lastLatencyMicros || 0,
          recvAudioCipher?.stats.lastLatencyMicros || 0
        ),
        averageLatencyMicros: Math.round(
          ((sendAudioCipher?.stats.averageLatencyMicros || 0) +
            (recvAudioCipher?.stats.averageLatencyMicros || 0)) /
            2
        ),
        droppedOrCorruptFrames: recvAudioCipher?.stats.droppedOrCorruptFrames || 0,
      },
      video: {
        framesEncrypted: sendVideoCipher?.stats.framesEncrypted || 0,
        framesDecrypted: recvVideoCipher?.stats.framesDecrypted || 0,
        bytesProcessed:
          (sendVideoCipher?.stats.bytesProcessed || 0) +
          (recvVideoCipher?.stats.bytesProcessed || 0),
        lastLatencyMicros: Math.max(
          sendVideoCipher?.stats.lastLatencyMicros || 0,
          recvVideoCipher?.stats.lastLatencyMicros || 0
        ),
        averageLatencyMicros: Math.round(
          ((sendVideoCipher?.stats.averageLatencyMicros || 0) +
            (recvVideoCipher?.stats.averageLatencyMicros || 0)) /
            2
        ),
        droppedOrCorruptFrames: recvVideoCipher?.stats.droppedOrCorruptFrames || 0,
      },
    });
  }
}, 1000);

