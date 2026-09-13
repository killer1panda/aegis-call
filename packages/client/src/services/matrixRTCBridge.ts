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

export interface MatrixSyncConfig {
  homeserverUrl: string;
  accessToken: string;
  roomId: string;
  deviceId?: string;
  pollIntervalMs?: number;
}

/**
 * Live Matrix 2.0 Client synchronizing decentralized MSC3401 call membership state
 * over the Matrix Client-Server API (/_matrix/client/v3/sync).
 */
export class MatrixLiveSyncClient {
  private config: MatrixSyncConfig;
  private bridge: MatrixRTCBridge;
  private isRunning: boolean = false;
  private pollTimer: any = null;
  private sinceToken: string | null = null;
  private onPeerUpdateCallback: ((peers: Array<{ deviceId: string; sessionId: string; hybridPublicKeyHex?: string }>) => void) | null = null;

  constructor(config: MatrixSyncConfig) {
    this.config = config;
    this.bridge = new MatrixRTCBridge(config.roomId, config.deviceId || `aegis-${Date.now()}`);
  }

  public getBridge(): MatrixRTCBridge {
    return this.bridge;
  }

  /**
   * Publishes org.matrix.msc3401.call.member state event to the Matrix room.
   */
  public async publishCallMemberEvent(callId: string, sessionId: string, hybridPublicKeyHex?: string): Promise<{ event_id: string }> {
    const eventContent = this.bridge.generateCallMemberEvent(callId, sessionId, hybridPublicKeyHex);
    const url = `${this.config.homeserverUrl.replace(/\/$/, '')}/_matrix/client/v3/rooms/${encodeURIComponent(this.config.roomId)}/state/org.matrix.msc3401.call.member/${encodeURIComponent(this.config.deviceId || 'default')}`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.accessToken}`,
      },
      body: JSON.stringify(eventContent),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Matrix state event publish failed (${res.status}): ${err}`);
    }

    return (await res.json()) as { event_id: string };
  }

  /**
   * Starts live Matrix /sync long-polling loop to stream federated m.call.member updates.
   */
  public startSyncLoop(
    onPeerUpdate: (peers: Array<{ deviceId: string; sessionId: string; hybridPublicKeyHex?: string }>) => void
  ): { stop: () => void } {
    this.isRunning = true;
    this.onPeerUpdateCallback = onPeerUpdate;

    const poll = async () => {
      if (!this.isRunning) return;

      try {
        let syncUrl = `${this.config.homeserverUrl.replace(/\/$/, '')}/_matrix/client/v3/sync?timeout=15000`;
        if (this.sinceToken) syncUrl += `&since=${encodeURIComponent(this.sinceToken)}`;

        const res = await fetch(syncUrl, {
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
          },
        });

        if (res.ok) {
          const syncData = await res.json();
          this.sinceToken = syncData.next_batch;

          // Parse room timeline & state events for MSC3401
          const roomEvents = syncData.rooms?.join?.[this.config.roomId]?.state?.events || [];
          for (const ev of roomEvents) {
            if (ev.type === 'org.matrix.msc3401.call.member' && ev.content) {
              const peers = this.bridge.parsePeerMembership(ev.content);
              this.onPeerUpdateCallback?.(peers);
            }
          }
        }
      } catch {
        // Network error or timeout; retry
      }

      if (this.isRunning) {
        this.pollTimer = setTimeout(poll, this.config.pollIntervalMs || 3000);
      }
    };

    poll();

    return {
      stop: () => this.stop(),
    };
  }

  /**
   * Leaves call by publishing an empty state event to withdraw membership.
   */
  public async leaveCall(): Promise<void> {
    this.stop();
    const url = `${this.config.homeserverUrl.replace(/\/$/, '')}/_matrix/client/v3/rooms/${encodeURIComponent(this.config.roomId)}/state/org.matrix.msc3401.call.member/${encodeURIComponent(this.config.deviceId || 'default')}`;

    try {
      await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.accessToken}`,
        },
        body: JSON.stringify({ 'm.calls': [] }),
      });
    } catch {}
  }

  public stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
