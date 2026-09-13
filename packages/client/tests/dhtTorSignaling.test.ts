import { describe, it, expect } from 'vitest';
import { DhtTorSignalingService, DhtSignalingItem } from '../src/services/dhtTorSignaling.js';

describe('AegisCall Decentralized Tor & BitTorrent DHT Signaling Gateway', () => {
  it('should derive deterministic 40-character hexadecimal DHT target keys from room ID', async () => {
    const roomId = 'secure-conf-room-99';
    const key1 = await DhtTorSignalingService.deriveDhtTargetKey(roomId);
    const key2 = await DhtTorSignalingService.deriveDhtTargetKey(roomId);

    expect(key1).toBe(key2);
    expect(key1).toHaveLength(40);
    expect(/^[0-9a-f]{40}$/.test(key1)).toBe(true);

    const differentRoomKey = await DhtTorSignalingService.deriveDhtTargetKey('other-room');
    expect(differentRoomKey).not.toBe(key1);
  });

  it('should manage Tor SOCKS5 proxy configuration and proxy URL wrapping correctly', () => {
    const service = new DhtTorSignalingService();
    const defaultConfig = service.getTorConfig();

    expect(defaultConfig.enabled).toBe(false);
    expect(defaultConfig.socksHost).toBe('127.0.0.1');
    expect(defaultConfig.socksPort).toBe(9050);
    expect(defaultConfig.onionAddress).toBeUndefined();

    // When disabled, returns original URL unchanged
    expect(service.getTorProxyUrl('https://signaling.aegis.internal/ws')).toBe('https://signaling.aegis.internal/ws');

    // Enable Tor proxy
    service.setTorConfig({
      enabled: true,
      socksPort: 9150,
      onionAddress: 'aegisrelay345678abcdef.onion',
    });

    const updatedConfig = service.getTorConfig();
    expect(updatedConfig.enabled).toBe(true);
    expect(updatedConfig.socksHost).toBe('127.0.0.1');
    expect(updatedConfig.socksPort).toBe(9150);
    expect(updatedConfig.onionAddress).toBe('aegisrelay345678abcdef.onion');

    // When enabled, wraps target into socks5h URL
    expect(service.getTorProxyUrl('https://signaling.aegis.internal/ws')).toBe(
      'socks5h://127.0.0.1:9150/signaling.aegis.internal/ws'
    );
  });

  it('should publish signaling items to DHT with valid sequence and timestamp metadata', async () => {
    const service = new DhtTorSignalingService();
    const roomId = 'dht-test-room';

    const item1 = await service.publishDhtItem(roomId, 'peer-alice', 'offer', { sdp: 'fake-sdp-offer' });
    expect(item1.sender).toBe('peer-alice');
    expect(item1.payloadType).toBe('offer');
    expect(item1.payload).toEqual({ sdp: 'fake-sdp-offer' });
    expect(item1.sequence).toBeGreaterThan(0);
    expect(item1.timestamp).toBeGreaterThan(0);
    expect(item1.targetKey).toHaveLength(40);

    const item2 = await service.publishDhtItem(roomId, 'peer-alice', 'candidate', { candidate: 'candidate:1' });
    expect(item2.payloadType).toBe('candidate');
  });

  it('should initialize and stop DHT rendezvous listening cleanly', async () => {
    const service = new DhtTorSignalingService();
    const roomId = 'rendezvous-room';
    const receivedItems: DhtSignalingItem[] = [];

    await service.startDhtRendezvous(roomId, 'local-peer-charlie', (item) => {
      receivedItems.push(item);
    });

    // Publish item from remote peer bob
    await service.publishDhtItem(roomId, 'remote-peer-bob', 'answer', { sdp: 'remote-answer-sdp' });

    // Stop rendezvous
    expect(() => service.stopDhtRendezvous()).not.toThrow();
  });
});
