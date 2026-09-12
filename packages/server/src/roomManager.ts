import { WebSocket } from 'ws';
import { PeerSession, ServerMessage, SignalPayload } from './types.js';

export class RoomManager {
  // Map of roomId -> Map<peerId, PeerSession>
  private rooms: Map<string, Map<string, PeerSession>> = new Map();
  // Map of socket -> { peerId, roomId } for rapid teardown on disconnect
  private socketToPeer: Map<WebSocket, { peerId: string; roomId: string }> = new Map();
  private maxPeers: number;

  constructor(maxPeers: number = 8) {
    this.maxPeers = maxPeers;
  }

  public joinRoom(
    roomId: string,
    peerId: string,
    socket: WebSocket
  ): { success: boolean; error?: string; isInitiator?: boolean; peersInRoom?: string[] } {
    let room = this.rooms.get(roomId);

    if (!room) {
      room = new Map();
      this.rooms.set(roomId, room);
    }

    // Room capacity limit (defaults to 8 peers matching SFU Relay topology)
    if (room.size >= this.maxPeers && !room.has(peerId)) {
      return { success: false, error: 'ROOM_FULL' };
    }

    const isInitiator = room.size === 0;
    const session: PeerSession = {
      peerId,
      roomId,
      socket,
      connectedAt: Date.now(),
    };

    room.set(peerId, session);
    this.socketToPeer.set(socket, { peerId, roomId });

    // Notify any existing peer that a new peer has joined
    for (const [existingPeerId, existingSession] of room.entries()) {
      if (existingPeerId !== peerId && existingSession.socket.readyState === WebSocket.OPEN) {
        this.send(existingSession.socket, {
          type: 'peer-joined',
          peerId,
        });
      }
    }

    const peersInRoom = Array.from(room.keys());

    return {
      success: true,
      isInitiator,
      peersInRoom,
    };
  }

  public routeSignal(
    senderSocket: WebSocket,
    targetPeerId: string,
    data: SignalPayload
  ): boolean {
    const peerMeta = this.socketToPeer.get(senderSocket);
    if (!peerMeta) return false;

    const room = this.rooms.get(peerMeta.roomId);
    if (!room) return false;

    const targetSession = room.get(targetPeerId);
    if (!targetSession || targetSession.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.send(targetSession.socket, {
      type: 'signal',
      senderPeerId: peerMeta.peerId,
      data,
    });

    return true;
  }

  public handleDisconnect(socket: WebSocket): { roomId?: string; peerId?: string } {
    const peerMeta = this.socketToPeer.get(socket);
    if (!peerMeta) return {};

    const { peerId, roomId } = peerMeta;
    this.socketToPeer.delete(socket);

    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(peerId);

      // Notify remaining peer
      for (const remainingSession of room.values()) {
        if (remainingSession.socket.readyState === WebSocket.OPEN) {
          this.send(remainingSession.socket, {
            type: 'peer-left',
            peerId,
          });
        }
      }

      // Zero-persistence: destroy room when empty
      if (room.size === 0) {
        this.rooms.delete(roomId);
      }
    }

    return { roomId, peerId };
  }

  public getActiveRoomCount(): number {
    return this.rooms.size;
  }

  public getRoomPeers(roomId: string): string[] {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.keys()) : [];
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }
}
