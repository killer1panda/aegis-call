/**
 * Matrix 2.0 (MSC3401 / MatrixRTC) Interoperability Bridge
 * Maps AegisCall Hybrid ML-KEM SFrame key agreements and WebRTC topologies
 * to Matrix decentralized state events (org.matrix.msc3401.call.member).
 */
export interface MatrixCallMemberContent {
  'm.calls': Array<{
    'm.call_id': string;
    'm.devices': Array<{
      device_id: string;
      session_id: string;
      feeds: Array<{
        purpose: 'm.usermedia' | 'm.screenshare';
      }>;
      foci: Array<{
        type: 'livekit' | 'sframe-mesh';
        livekit_service_url?: string;
      }>;
      aegis_pqc_hybrid_pk?: string;
    }>;
  }>;
}

export class MatrixRTCBridge {
  private roomId: string;
  private localDeviceId: string;

  constructor(roomId: string, localDeviceId = `aegis-${Date.now()}`) {
    this.roomId = roomId;
    this.localDeviceId = localDeviceId;
  }

  /**
   * Generates MSC3401 compliant org.matrix.msc3401.call.member state event content.
   */
  public generateCallMemberEvent(
    callId: string,
    sessionId: string,
    hybridPublicKeyHex?: string
  ): MatrixCallMemberContent {
    return {
      'm.calls': [
        {
          'm.call_id': callId,
          'm.devices': [
            {
              device_id: this.localDeviceId,
              session_id: sessionId,
              feeds: [
                {
                  purpose: 'm.usermedia',
                },
              ],
              foci: [
                {
                  type: 'sframe-mesh',
                },
              ],
              aegis_pqc_hybrid_pk: hybridPublicKeyHex,
            },
          ],
        },
      ],
    };
  }

  /**
   * Translates incoming Matrix MSC3401 state events into AegisCall peer public keys.
   */
  public parsePeerMembership(event: MatrixCallMemberContent): Array<{
    deviceId: string;
    sessionId: string;
    hybridPublicKeyHex?: string;
  }> {
    const peers: Array<{ deviceId: string; sessionId: string; hybridPublicKeyHex?: string }> = [];

    for (const call of event['m.calls'] || []) {
      for (const dev of call['m.devices'] || []) {
        if (dev.device_id !== this.localDeviceId) {
          peers.push({
            deviceId: dev.device_id,
            sessionId: dev.session_id,
            hybridPublicKeyHex: dev.aegis_pqc_hybrid_pk,
          });
        }
      }
    }

    return peers;
  }
}
