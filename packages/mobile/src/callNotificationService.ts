import { Capacitor } from '@capacitor/core';

export interface IncomingCallPayload {
  callId: string;
  callerDid: string;
  callerName: string;
  roomId: string;
  hasVideo: boolean;
  isPostQuantum: boolean;
  timestamp: number;
}

export type CallEventListener = (payload: IncomingCallPayload) => void;
export type CallEndListener = (callId: string) => void;

/**
 * Native CallKit (iOS) and ConnectionService / TelecomManager (Android)
 * background incoming call notification and telephony state manager.
 */
export class CallNotificationService {
  private static answerListeners: Set<CallEventListener> = new Set();
  private static rejectListeners: Set<CallEndListener> = new Set();
  private static activeCalls: Map<string, IncomingCallPayload> = new Map();

  /**
   * Reports an incoming VoIP push notification to the native OS dialer UI.
   * On iOS, invokes CXProvider (CallKit).
   * On Android, invokes TelecomManager ConnectionService.
   */
  public static async reportIncomingCall(payload: IncomingCallPayload): Promise<boolean> {
    this.activeCalls.set(payload.callId, payload);

    if (Capacitor.isNativePlatform()) {
      const platform = Capacitor.getPlatform(); // 'ios' | 'android'
      console.log(`[AegisMobile] Invoking native ${platform} telephony subsystem for call ${payload.callId}`);

      // Native Bridge notification dispatch
      try {
        if ((window as any).AegisCallKitBridge) {
          await (window as any).AegisCallKitBridge.reportIncomingCall({
            uuid: payload.callId,
            handle: payload.callerName,
            hasVideo: payload.hasVideo,
            localizedCallerName: `${payload.callerName} (E2EE Shield)`,
          });
          return true;
        }
      } catch (err) {
        console.warn('[AegisMobile] Native bridge call error:', err);
      }
    }

    // Web / Desktop notification fallback
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const notification = new Notification(`Incoming Secure Call: ${payload.callerName}`, {
        body: `Zero-Trust E2EE Room: ${payload.roomId} • ML-KEM-768 Active`,
        icon: '/favicon.ico',
        tag: payload.callId,
        requireInteraction: true,
      });

      notification.onclick = () => {
        window.focus();
        this.emitAnswer(payload);
        notification.close();
      };
    }

    return true;
  }

  public static answerCall(callId: string): void {
    const call = this.activeCalls.get(callId);
    if (call) {
      this.emitAnswer(call);
    }
  }

  public static endCall(callId: string): void {
    this.activeCalls.delete(callId);
    for (const listener of this.rejectListeners) {
      try {
        listener(callId);
      } catch (err) {
        console.error('[AegisMobile] Error in call reject listener:', err);
      }
    }
  }

  public static onCallAnswered(listener: CallEventListener): () => void {
    this.answerListeners.add(listener);
    return () => this.answerListeners.delete(listener);
  }

  public static onCallRejected(listener: CallEndListener): () => void {
    this.rejectListeners.add(listener);
    return () => this.rejectListeners.delete(listener);
  }

  public static isCallKitSupported(): boolean {
    return Capacitor.getPlatform() === 'ios';
  }

  public static isConnectionServiceSupported(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  private static emitAnswer(payload: IncomingCallPayload): void {
    for (const listener of this.answerListeners) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[AegisMobile] Error in call answer listener:', err);
      }
    }
  }
}
