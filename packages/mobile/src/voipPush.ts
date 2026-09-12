import { Capacitor } from '@capacitor/core';
import { CallNotificationService, IncomingCallPayload } from './callNotificationService.js';

export class VoipPushService {
  private static token: string | null = null;

  /**
   * Generates or retrieves the device VoIP push token and registers it with the
   * AegisCall signaling push gateway.
   */
  public static async registerDevice(peerDid: string, gatewayUrl: string = ''): Promise<string> {
    const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';

    if (Capacitor.isNativePlatform()) {
      try {
        if ((window as any).AegisVoipPushBridge) {
          this.token = await (window as any).AegisVoipPushBridge.getVoipToken();
        }
      } catch (err) {
        console.warn('[VoipPush] Native push token retrieval failed:', err);
      }
    }

    if (!this.token) {
      // Ephemeral simulated token for desktop/web testing
      this.token = `voip-token-${platform}-${Math.random().toString(36).substring(2, 12)}`;
    }

    // Register with push server if gatewayUrl provided
    if (gatewayUrl) {
      try {
        await fetch(`${gatewayUrl}/api/push/register`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            peerDid,
            platform,
            pushToken: this.token,
          }),
        });
      } catch (err) {
        console.warn('[VoipPush] Push gateway registration failed:', err);
      }
    }

    return this.token;
  }

  /**
   * Invoked upon incoming APNs VoIP or FCM push notification arrival.
   * Hands payload directly to native OS telephony manager (CallKit / ConnectionService).
   */
  public static async onPushReceived(rawPayload: any): Promise<boolean> {
    const data = rawPayload.data || rawPayload;
    const incomingCall: IncomingCallPayload = {
      callId: data.callId || `call-${Date.now()}`,
      callerDid: data.callerDid || 'did:key:zAegisCaller',
      callerName: data.callerName || 'Aegis Verified Peer',
      roomId: data.roomId || 'aegis-secure-room',
      hasVideo: !!data.hasVideo,
      isPostQuantum: !!data.isPostQuantum,
      timestamp: data.timestamp || Date.now(),
    };

    return CallNotificationService.reportIncomingCall(incomingCall);
  }
}
