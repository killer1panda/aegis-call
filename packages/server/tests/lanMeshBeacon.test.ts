import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LanMeshBeaconService } from '../src/lanMeshBeacon.js';
import Fastify from 'fastify';

describe('AegisCall Air-Gapped Multi-Machine LAN Mesh Discovery Beacon', () => {
  let beacon: LanMeshBeaconService;

  beforeEach(() => {
    beacon = LanMeshBeaconService.getInstance();
  });

  afterEach(async () => {
    await beacon.stop();
  });

  it('should maintain singleton instance', () => {
    const b2 = LanMeshBeaconService.getInstance();
    expect(beacon).toBe(b2);
  });

  it('should parse incoming valid LAN beacon datagrams and maintain active peers', () => {
    const packet = {
      magic: 'AEGIS_LAN_MESH',
      version: 1,
      roomId: 'airgap-room-42',
      peerId: 'peer-machine-beta',
      serviceUrl: 'http://192.168.1.102:4000',
      timestamp: Date.now(),
    };

    const buffer = Buffer.from(JSON.stringify(packet));
    beacon.handleIncomingDatagram(buffer, {
      address: '192.168.1.102',
      family: 'IPv4',
      port: 7777,
      size: buffer.length,
    });

    const peers = beacon.getPeersForRoom('airgap-room-42');
    expect(peers).toHaveLength(1);
    expect(peers[0].peerId).toBe('peer-machine-beta');
    expect(peers[0].remoteAddress).toBe('192.168.1.102');
    expect(peers[0].serviceUrl).toBe('http://192.168.1.102:4000');
  });

  it('should ignore malformed or non-Aegis UDP datagrams', () => {
    const junkBuffer = Buffer.from('NOT_A_VALID_JSON_OR_MAGIC');
    beacon.handleIncomingDatagram(junkBuffer, {
      address: '10.0.0.99',
      family: 'IPv4',
      port: 5353,
      size: junkBuffer.length,
    });

    const peers = beacon.getPeersForRoom('airgap-room-42');
    expect(peers.find((p) => p.peerId === 'unknown')).toBeUndefined();
  });

  it('should register Fastify REST discovery endpoints and return discovered peers', async () => {
    const server = Fastify();
    beacon.registerRoutes(server);

    // Seed a discovered peer
    beacon.handleIncomingDatagram(
      Buffer.from(
        JSON.stringify({
          magic: 'AEGIS_LAN_MESH',
          version: 1,
          roomId: 'room-alpha',
          peerId: 'laptop-charlie',
          timestamp: Date.now(),
        })
      ),
      { address: '192.168.1.88', family: 'IPv4', port: 7777, size: 50 }
    );

    const res = await server.inject({
      method: 'GET',
      url: '/api/lan/peers/room-alpha',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.roomId).toBe('room-alpha');
    expect(body.total).toBe(1);
    expect(body.peers[0].peerId).toBe('laptop-charlie');

    await server.close();
  });
});
