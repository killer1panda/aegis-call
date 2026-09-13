// ==============================================================================
// 🛡️ AegisCall W3C WebRTC Encoded Transform Type Declarations
// Conforms to W3C WebRTC Encoded Transform Spec (RTCRtpScriptTransform)
// Eliminates untyped `any` casting at production boundaries (ECC Invariant)
// ==============================================================================

export {};

declare global {
  /**
   * W3C WebRTC Encoded Transform Script Transform interface
   */
  class RTCRtpScriptTransform {
    constructor(worker: Worker, options?: Record<string, unknown>, transfer?: Transferable[]);
  }

  interface Window {
    RTCRtpScriptTransform?: typeof RTCRtpScriptTransform;
  }

  interface RTCRtpSender {
    transform?: RTCRtpScriptTransform | null;
  }

  interface RTCRtpReceiver {
    transform?: RTCRtpScriptTransform | null;
  }
}
