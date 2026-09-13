/**
 * AegisCall Air-Gapped Multi-Machine LAN Mesh Discovery Beacon
 * Implements native UDP broadcast and multicast discovery (RFC 1122, RFC 5771).
 * Enables multiple physical machines on the same local area network (LAN/WLAN)
 * to discover each other and negotiate peer-to-peer WebRTC calls with 0% internet.
 */

import dgram from 'dgram';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export interface LanDiscoveredPeer {
  peerId: string;
  roomId: string;
  remoteAddress: string;
  port: number;
  serviceUrl?: string;
  lastSeen: number;
}

export interface LanBeaconPacket {
  magic: 'AEGIS_LAN_MESH';
  version: 1;
  roomId: string;
  peerId: string;
  serviceUrl?: string;
  timestamp: number;
}

export class LanMeshBeaconService {
  private static instance: LanMeshBeaconService | null = null;
  private socket: dgram.Socket | null = null;
  private port: number = 7777;
  private multicastGroup: string = '224.0.0.251';
  private discoveredPeers: Map<string, LanDiscoveredPeer> = new Map();
  private activeAnnouncements: Map<string, { roomId: string; peerId: string; serviceUrl?: string }> = new Map();
  private beaconInterval: NodeJS.Timeout | null = null;
  private isListening: boolean = false;

  public static getInstance(): LanMeshBeaconService {
    if (!LanMeshBeaconService.instance) {
      LanMeshBeaconService.instance = new LanMeshBeaconService();
    }
    return LanMeshBeaconService.instance;
  }

  /**
   * Starts the native UDP discovery listener on the LAN interface.
   */
  public async start(port = 7777, host = '0.0.0.0'): Promise<void> {
    if (this.isListening) return;
    this.port = port;

    return new Promise((resolve, reject) => {
      try {
        const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        socket.on('error', (err) => {
          // In environments without raw UDP permissions or port conflict, fail gracefully
          console.warn('[LanMeshBeacon] UDP socket error:', err.message);
        });

        socket.on('message', (msg, rinfo) => {
          this.handleIncomingDatagram(msg, rinfo);
        });

        socket.bind(this.port, host, () => {
          this.isListening = true;
          this.socket = socket;

          try {
            socket.setBroadcast(true);
            socket.setMulticastTTL(2);
            socket.addMembership(this.multicastGroup);
          } catch (multicastErr: any) {
            // Multicast membership might require specific interface; broadcast remains active
            console.debug('[LanMeshBeacon] Multicast membership notice:', multicastErr.message);
          }

          // Start background broadcast & pruning loop (every 3 seconds)
          this.beaconInterval = setInterval(() => {
            this.broadcastActiveBeacons();
            this.pruneStalePeers();
          }, 3000);

          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Broadcasts active room presence beacons to all peers on the local subnet.
   */
  public broadcastActiveBeacons(): void {
    if (!this.socket || !this.isListening) return;

    for (const item of this.activeAnnouncements.values()) {
      const packet: LanBeaconPacket = {
        magic: 'AEGIS_LAN_MESH',
        version: 1,
        roomId: item.roomId,
        peerId: item.peerId,
        serviceUrl: item.serviceUrl,
        timestamp: Date.now(),
      };

      const payload = Buffer.from(JSON.stringify(packet));

      // Broadcast to local subnet broadcast address
      this.socket.send(payload, 0, payload.length, this.port, '255.255.255.255', (err) => {
        if (err) console.debug('[LanMeshBeacon] Broadcast error:', err.message);
      });

      // Also multicast to group
      this.socket.send(payload, 0, payload.length, this.port, this.multicastGroup, (err) => {
        if (err) console.debug('[LanMeshBeacon] Multicast error:', err.message);
      });
    }
  }

  /**
   * Handles incoming UDP discovery datagrams from other physical nodes on the LAN.
   */
  public handleIncomingDatagram(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      const packet: LanBeaconPacket = JSON.parse(msg.toString('utf-8'));
      if (packet.magic !== 'AEGIS_LAN_MESH' || packet.version !== 1) return;

      const peerKey = `${packet.roomId}:${packet.peerId}`;
      const peer: LanDiscoveredPeer = {
        peerId: packet.peerId,
        roomId: packet.roomId,
        remoteAddress: rinfo.address,
        port: rinfo.port,
        serviceUrl: packet.serviceUrl,
        lastSeen: Date.now(),
      };

      this.discoveredPeers.set(peerKey, peer);
    } catch {
      // Ignore malformed datagrams
    }
  }

  /**
   * Registers an active peer announcement for a room.
   */
  public announcePresence(roomId: string, peerId: string, serviceUrl?: string): void {
    this.activeAnnouncements.set(`${roomId}:${peerId}`, { roomId, peerId, serviceUrl });
    // Trigger immediate beacon dispatch
    this.broadcastActiveBeacons();
  }

  /**
   * Removes peer presence announcement when leaving a room.
   */
  public removePresence(roomId: string, peerId: string): void {
    this.activeAnnouncements.delete(`${roomId}:${peerId}`);
    this.discoveredPeers.delete(`${roomId}:${peerId}`);
  }

  /**
   * Returns list of currently active LAN peers for a specific room.
   */
  public getPeersForRoom(roomId: string): LanDiscoveredPeer[] {
    const now = Date.now();
    const result: LanDiscoveredPeer[] = [];

    for (const peer of this.discoveredPeers.values()) {
      if (peer.roomId === roomId && now - peer.lastSeen <= 15000) {
        result.push(peer);
      }
    }

    return result;
  }

  /**
   * Removes peers not seen within the last 15 seconds.
   */
  private pruneStalePeers(): void {
    const now = Date.now();
    for (const [key, peer] of this.discoveredPeers.entries()) {
      if (now - peer.lastSeen > 15000) {
        this.discoveredPeers.delete(key);
      }
    }
  }

  /**
   * Stops the UDP socket and beacon timers.
   */
  public async stop(): Promise<void> {
    if (this.beaconInterval) {
      clearInterval(this.beaconInterval);
      this.beaconInterval = null;
    }

    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }

    this.isListening = false;
    this.discoveredPeers.clear();
    this.activeAnnouncements.clear();
  }

  /**
   * Registers REST discovery routes on Fastify server.
   */
  public registerRoutes(server: FastifyInstance): void {
    server.get('/api/lan/peers/:roomId', async (request: FastifyRequest<{ Params: { roomId: string } }>, reply: FastifyReply) => {
      const { roomId } = request.params;
      const peers = this.getPeersForRoom(roomId);
      return reply.send({
        roomId,
        peers,
        total: peers.length,
      });
    });

    server.post('/api/lan/announce', async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { roomId?: string; peerId?: string; serviceUrl?: string };
      if (!body.roomId || !body.peerId) {
        return reply.status(400).send({ error: 'Missing required parameters: roomId and peerId' });
      }

      this.announcePresence(body.roomId, body.peerId, body.serviceUrl);
      return reply.send({
        success: true,
        message: `Broadcasting LAN beacon for peer ${body.peerId} in room ${body.roomId}`,
      });
    });

    server.post('/api/lan/leave', async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { roomId?: string; peerId?: string };
      if (body.roomId && body.peerId) {
        this.removePresence(body.roomId, body.peerId);
      }
      return reply.send({ success: true });
    });
  }
}
