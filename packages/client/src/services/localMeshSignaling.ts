export interface MeshMessage {
  type: string;
  roomId: string;
  senderId: string;
  targetId?: string;
  payload?: any;
  timestamp: number;
}

export type MeshMessageHandler = (msg: MeshMessage) => void;

/**
 * Air-Gapped Offline Local Mesh Signaling Adapter.
 * Coordinates peer discovery and WebRTC session negotiation over:
 * 1. Layer 1 (Same Host): Browser BroadcastChannel for tab-local testing.
 * 2. Layer 2 (Cross-Machine Physical LAN): LAN UDP Multicast / Broadcast Beacon daemon (port 7777 / 224.0.0.251).
 * 3. Layer 3 (Physical Air-Gap): Mobile MeshRadioAdapter (Bluetooth LE Peripheral & Wi-Fi Direct).
 * Zero reliance on internet access, centralized servers, or external telemetry.
 */
export class LocalMeshSignaling {
  private static channels = new Map<string, BroadcastChannel>();
  private static listeners = new Map<string, Set<MeshMessageHandler>>();
  private static lanPollIntervals = new Map<string, any>();
  private static knownLanPeers = new Map<string, Set<string>>();

  /**
   * Returns the current operational signaling transport mode.
   */
  public static getSignalingMode(roomId: string): 'lan-udp-beacon' | 'browser-tab-broadcast' | 'offline' {
    if (!this.channels.has(`aegis-mesh:${roomId}`)) {
      return 'offline';
    }
    if (this.lanPollIntervals.has(roomId)) {
      return 'lan-udp-beacon';
    }
    return 'browser-tab-broadcast';
  }

  /**
   * Initializes local broadcast channel and optional LAN UDP beacon synchronization.
   */
  public static connect(
    roomId: string,
    localPeerId: string,
    onMessage: MeshMessageHandler,
    options?: { lanServiceUrl?: string }
  ): void {
    const channelKey = `aegis-mesh:${roomId}`;

    let channel = this.channels.get(channelKey);
    if (!channel) {
      channel = new BroadcastChannel(channelKey);
      channel.onmessage = (event: MessageEvent) => {
        const msg = event.data as MeshMessage;
        if (!msg || msg.senderId === localPeerId) return; // Ignore own echoes

        const roomListeners = this.listeners.get(roomId);
        if (roomListeners) {
          roomListeners.forEach((handler) => handler(msg));
        }
      };
      this.channels.set(channelKey, channel);
    }

    if (!this.listeners.has(roomId)) {
      this.listeners.set(roomId, new Set());
    }
    this.listeners.get(roomId)!.add(onMessage);

    // Announce presence to local mesh peers
    this.send(roomId, {
      type: 'peer-joined',
      roomId,
      senderId: localPeerId,
      timestamp: Date.now(),
    });

    // Cross-machine LAN UDP beacon synchronization (if service available)
    const lanUrl = options?.lanServiceUrl || (typeof window !== 'undefined' ? window.location?.origin : undefined);
    if (lanUrl && typeof fetch === 'function') {
      // 1. Announce presence to local LAN UDP beacon daemon
      fetch(`${lanUrl}/api/lan/announce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, peerId: localPeerId }),
      }).catch(() => {});

      // 2. Poll for physical LAN subnet peers
      if (!this.knownLanPeers.has(roomId)) {
        this.knownLanPeers.set(roomId, new Set());
      }

      const pollLanPeers = async () => {
        try {
          const res = await fetch(`${lanUrl}/api/lan/peers/${roomId}`);
          if (!res.ok) return;
          const data = await res.json();
          const peers = (data.peers || []) as Array<{ peerId: string; remoteAddress: string }>;

          const roomKnown = this.knownLanPeers.get(roomId)!;
          for (const p of peers) {
            if (p.peerId !== localPeerId && !roomKnown.has(p.peerId)) {
              roomKnown.add(p.peerId);
              const roomListeners = this.listeners.get(roomId);
              if (roomListeners) {
                const meshMsg: MeshMessage = {
                  type: 'peer-joined',
                  roomId,
                  senderId: p.peerId,
                  payload: { transport: 'lan-udp-mesh', address: p.remoteAddress },
                  timestamp: Date.now(),
                };
                roomListeners.forEach((h) => h(meshMsg));
              }
            }
          }
        } catch {}
      };

      const interval = setInterval(pollLanPeers, 3000);
      this.lanPollIntervals.set(roomId, interval);
    }
  }

  /**
   * Dispatches a signaling message across the local air-gapped mesh channel.
   */
  public static send(roomId: string, message: Partial<MeshMessage>): void {
    const channelKey = `aegis-mesh:${roomId}`;
    const channel = this.channels.get(channelKey);
    if (!channel) return;

    const fullMessage: MeshMessage = {
      type: message.type || 'unknown',
      roomId,
      senderId: message.senderId || 'anonymous',
      targetId: message.targetId,
      payload: message.payload,
      timestamp: Date.now(),
    };

    channel.postMessage(fullMessage);
  }

  /**
   * Leaves and disconnects local mesh signaling for a room.
   */
  public static disconnect(roomId: string, localPeerId: string, options?: { lanServiceUrl?: string }): void {
    const channelKey = `aegis-mesh:${roomId}`;

    this.send(roomId, {
      type: 'peer-left',
      roomId,
      senderId: localPeerId,
      timestamp: Date.now(),
    });

    const channel = this.channels.get(channelKey);
    if (channel) {
      channel.close();
      this.channels.delete(channelKey);
    }
    this.listeners.delete(roomId);

    // Stop LAN polling and notify LAN beacon of leave
    const interval = this.lanPollIntervals.get(roomId);
    if (interval) {
      clearInterval(interval);
      this.lanPollIntervals.delete(roomId);
    }
    this.knownLanPeers.delete(roomId);

    const lanUrl = options?.lanServiceUrl || (typeof window !== 'undefined' ? window.location?.origin : undefined);
    if (lanUrl && typeof fetch === 'function') {
      fetch(`${lanUrl}/api/lan/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, peerId: localPeerId }),
      }).catch(() => {});
    }
  }
}
