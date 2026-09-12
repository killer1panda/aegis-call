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
 * Coordinates peer discovery and WebRTC session negotiation over local network
 * broadcast channels with 0% reliance on internet access or cloud servers.
 */
export class LocalMeshSignaling {
  private static channels = new Map<string, BroadcastChannel>();
  private static listeners = new Map<string, Set<MeshMessageHandler>>();

  /**
   * Initializes local broadcast channel for a specific calling room.
   */
  public static connect(roomId: string, localPeerId: string, onMessage: MeshMessageHandler): void {
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
  public static disconnect(roomId: string, localPeerId: string): void {
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
  }
}
