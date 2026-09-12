import { WebSocket } from 'ws';

export type SimulcastTier = 'high' | 'medium' | 'low';

export interface SfuProducer {
  producerId: string;
  peerId: string;
  kind: 'audio' | 'video';
  sframeKeyId: string;
  simulcastTier?: SimulcastTier;
  spatialLayer?: number;
  temporalLayer?: number;
  active: boolean;
}

export interface SfuConsumer {
  consumerId: string;
  peerId: string;
  producerId: string;
  preferredTier?: SimulcastTier;
  framesForwarded?: number;
  framesDropped?: number;
}


export interface SfuRoom {
  roomId: string;
  maxPeers: number;
  peers: Map<string, WebSocket>;
  producers: Map<string, SfuProducer>;
  consumers: Map<string, SfuConsumer>;
  activeSpeakerPeerId: string | null;
}

/**
 * Blind SFU (Selective Forwarding Unit) Router
 * Routes end-to-end encrypted SFrame media packets across multiple peers (up to 8)
 * without ever decrypting or accessing the underlying media payloads or cryptographic keys.
 */
export class SfuRelay {
  private rooms: Map<string, SfuRoom> = new Map();

  public getOrCreateRoom(roomId: string, maxPeers: number = 8): SfuRoom {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        roomId,
        maxPeers,
        peers: new Map(),
        producers: new Map(),
        consumers: new Map(),
        activeSpeakerPeerId: null,
      };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  public joinRoom(
    roomId: string,
    peerId: string,
    socket: WebSocket,
    maxPeers: number = 8
  ): { success: boolean; error?: string; existingPeers?: string[]; activeProducers?: SfuProducer[] } {
    const room = this.getOrCreateRoom(roomId, maxPeers);

    if (room.peers.size >= room.maxPeers && !room.peers.has(peerId)) {
      return { success: false, error: 'SFU_ROOM_FULL' };
    }

    const existingPeers = Array.from(room.peers.keys()).filter((id) => id !== peerId);
    room.peers.set(peerId, socket);

    // Broadcast new peer join to all other participants
    this.broadcastToRoom(roomId, peerId, {
      type: 'sfu-peer-joined',
      peerId,
      totalPeers: room.peers.size,
    });

    const activeProducers = Array.from(room.producers.values());

    return {
      success: true,
      existingPeers,
      activeProducers,
    };
  }

  public registerProducer(
    roomId: string,
    peerId: string,
    kind: 'audio' | 'video',
    sframeKeyId: string
  ): SfuProducer | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const producerId = `prod-${peerId}-${kind}-${Date.now()}`;
    const producer: SfuProducer = {
      producerId,
      peerId,
      kind,
      sframeKeyId,
      active: true,
    };

    room.producers.set(producerId, producer);

    // Announce producer availability to all peers in the room so they can subscribe
    this.broadcastToRoom(roomId, peerId, {
      type: 'sfu-new-producer',
      producer,
    });

    return producer;
  }

  public forwardEncryptedFrame(
    roomId: string,
    senderPeerId: string,
    producerId: string,
    encryptedPayload: string | Buffer
  ): number {
    const room = this.rooms.get(roomId);
    if (!room) return 0;

    let forwardedCount = 0;
    const packet = JSON.stringify({
      type: 'sfu-frame-relay',
      producerId,
      senderPeerId,
      data: encryptedPayload,
    });

    for (const [peerId, socket] of room.peers.entries()) {
      if (peerId !== senderPeerId && socket.readyState === WebSocket.OPEN) {
        socket.send(packet);
        forwardedCount++;
      }
    }

    return forwardedCount;
  }

  /**
   * Sets a peer consumer's desired simulcast tier ('high' | 'medium' | 'low').
   */
  public setConsumerTier(
    roomId: string,
    peerId: string,
    producerId: string,
    preferredTier: SimulcastTier
  ): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const consumerId = `cons-${peerId}-${producerId}`;
    let consumer = room.consumers.get(consumerId);
    if (!consumer) {
      consumer = { consumerId, peerId, producerId, preferredTier };
      room.consumers.set(consumerId, consumer);
    } else {
      consumer.preferredTier = preferredTier;
    }
    return true;
  }

  /**
   * Blindly routes an encrypted simulcast frame only to peers whose selected tier
   * or downlink bandwidth matches the frame's quality level, without decrypting SFrame payloads.
   */
  public forwardEncryptedSimulcastFrame(
    roomId: string,
    senderPeerId: string,
    producerId: string,
    encryptedPayload: string | Buffer,
    tier: SimulcastTier,
    spatialLayer: number = 0,
    temporalLayer: number = 0
  ): number {
    const room = this.rooms.get(roomId);
    if (!room) return 0;

    let forwardedCount = 0;
    const packet = JSON.stringify({
      type: 'sfu-simulcast-relay',
      producerId,
      senderPeerId,
      tier,
      spatialLayer,
      temporalLayer,
      data: encryptedPayload,
    });

    for (const [peerId, socket] of room.peers.entries()) {
      if (peerId === senderPeerId || socket.readyState !== WebSocket.OPEN) continue;

      const consumerId = `cons-${peerId}-${producerId}`;
      let consumer = room.consumers.get(consumerId);
      if (!consumer) {
        consumer = {
          consumerId,
          peerId,
          producerId,
          preferredTier: 'high',
          framesForwarded: 0,
          framesDropped: 0,
        };
        room.consumers.set(consumerId, consumer);
      }
      const targetTier = consumer.preferredTier || 'high';

      // Tier matching: 'low' receivers only receive low tier; 'medium' receive medium; 'high' receive high
      const shouldForward = targetTier === tier || (targetTier === 'high' && tier === 'medium');
      if (shouldForward) {
        socket.send(packet);
        consumer.framesForwarded = (consumer.framesForwarded || 0) + 1;
        forwardedCount++;
      } else {
        consumer.framesDropped = (consumer.framesDropped || 0) + 1;
      }
    }

    return forwardedCount;
  }

  /**
   * Retrieves frame forwarding and drop telemetry for a specific peer consumer.
   */
  public getConsumerMetrics(
    roomId: string,
    peerId: string
  ): Array<{
    consumerId: string;
    producerId: string;
    preferredTier: SimulcastTier;
    framesForwarded: number;
    framesDropped: number;
    dropPercentage: number;
  }> {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    const metrics = [];
    for (const consumer of room.consumers.values()) {
      if (consumer.peerId === peerId) {
        const forwarded = consumer.framesForwarded || 0;
        const dropped = consumer.framesDropped || 0;
        const total = forwarded + dropped;
        metrics.push({
          consumerId: consumer.consumerId,
          producerId: consumer.producerId,
          preferredTier: consumer.preferredTier || 'high',
          framesForwarded: forwarded,
          framesDropped: dropped,
          dropPercentage: total > 0 ? (dropped / total) * 100 : 0,
        });
      }
    }
    return metrics;
  }


  public updateActiveSpeaker(roomId: string, speakerPeerId: string, audioLevel: number): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.activeSpeakerPeerId !== speakerPeerId && audioLevel > 20) {
      room.activeSpeakerPeerId = speakerPeerId;
      this.broadcastToRoom(roomId, null, {
        type: 'sfu-active-speaker',
        activeSpeakerPeerId: speakerPeerId,
        audioLevel,
      });
    }
  }

  public removePeer(socket: WebSocket): { roomId?: string; peerId?: string } {
    for (const [roomId, room] of this.rooms.entries()) {
      for (const [peerId, s] of room.peers.entries()) {
        if (s === socket) {
          room.peers.delete(peerId);

          // Clean up producers owned by this peer
          for (const [prodId, prod] of room.producers.entries()) {
            if (prod.peerId === peerId) {
              room.producers.delete(prodId);
              this.broadcastToRoom(roomId, peerId, {
                type: 'sfu-producer-closed',
                producerId: prodId,
              });
            }
          }

          // Notify room of departure
          this.broadcastToRoom(roomId, peerId, {
            type: 'sfu-peer-left',
            peerId,
            remainingPeers: room.peers.size,
          });

          // Zero-persistence: destroy empty room
          if (room.peers.size === 0) {
            this.rooms.delete(roomId);
          }

          return { roomId, peerId };
        }
      }
    }
    return {};
  }

  public getRoomStats(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return {
      roomId,
      peerCount: room.peers.size,
      producerCount: room.producers.size,
      activeSpeaker: room.activeSpeakerPeerId,
    };
  }

  private broadcastToRoom(roomId: string, excludePeerId: string | null, message: any): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const payload = JSON.stringify(message);
    for (const [peerId, socket] of room.peers.entries()) {
      if (peerId !== excludePeerId && socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }
}

export const sfuRelayRouter = new SfuRelay();
