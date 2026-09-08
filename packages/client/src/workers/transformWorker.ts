import { FrameCipher } from '@aegis/crypto';

// In Web Workers with WebRTC Encoded Transform, RTCTransformEvent is fired on global scope
declare const self: DedicatedWorkerGlobalScope & {
  onrtctransform?: (event: any) => void;
};

let audioCipher: FrameCipher | null = null;
let videoCipher: FrameCipher | null = null;

self.onmessage = (event: MessageEvent) => {
  const { type, audioKey, videoKey, ivBase } = event.data;

  if (type === 'init-ciphers') {
    if (audioKey && ivBase) {
      audioCipher = new FrameCipher(new Uint8Array(audioKey), new Uint8Array(ivBase));
    }
    if (videoKey && ivBase) {
      videoCipher = new FrameCipher(new Uint8Array(videoKey), new Uint8Array(ivBase));
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
        const cipher = kind === 'audio' ? audioCipher : videoCipher;

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
          // In case of corrupt frame, drop to prevent crash
          // or pass along according to policy
        }
      },
    });

    transformer.readable.pipeThrough(transformStream).pipeTo(transformer.writable);
  };
}

// Periodically report worker crypto stats to the main thread
setInterval(() => {
  if (audioCipher || videoCipher) {
    self.postMessage({
      type: 'crypto-stats',
      audio: audioCipher?.stats,
      video: videoCipher?.stats,
    });
  }
}, 1000);
