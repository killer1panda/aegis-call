import { describe, it, expect } from 'vitest';
import { SfuRelay } from '../src/sfuRelay.js';
import { WebSocket } from 'ws';

class MockWebSocket {
  public readyState: number = WebSocket.OPEN;
  public sentMessages: string[] = [];

  public send(data: string): void {
    this.sentMessages.push(data);
  }

  public getLastMessage(): any {
    if (this.sentMessages.length === 0) return null;
    return JSON.parse(this.sentMessages[this.sentMessages.length - 1]);
  }
}

describe('AegisCall Blind Multi-Party SFU Relay', () => {
  it('should support multi-peer room joining up to room capacity', () => {
    const sfu = new SfuRelay();
    const wsAlice = new MockWebSocket();
    const wsBob = new MockWebSocket();
    const wsCharlie = new MockWebSocket();

    const joinAlice = sfu.joinRoom('multi-room-1', 'alice', wsAlice as unknown as WebSocket, 4);
    expect(joinAlice.success).toBe(true);
    expect(joinAlice.existingPeers).toEqual([]);

    const joinBob = sfu.joinRoom('multi-room-1', 'bob', wsBob as unknown as WebSocket, 4);
    expect(joinBob.success).toBe(true);
    expect(joinBob.existingPeers).toEqual(['alice']);

    const joinCharlie = sfu.joinRoom('multi-room-1', 'charlie', wsCharlie as unknown as WebSocket, 4);
    expect(joinCharlie.success).toBe(true);
    expect(joinCharlie.existingPeers).toEqual(['alice', 'bob']);

    // Alice should receive notification of Charlie joining
    const lastAliceMsg = wsAlice.getLastMessage();
    expect(lastAliceMsg).toEqual({
      type: 'sfu-peer-joined',
      peerId: 'charlie',
      totalPeers: 3,
    });
  });

  it('should reject peers when max capacity is reached', () => {
    const sfu = new SfuRelay();
    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();
    const ws3 = new MockWebSocket();

    sfu.joinRoom('cap-room', 'peer1', ws1 as unknown as WebSocket, 2);
    sfu.joinRoom('cap-room', 'peer2', ws2 as unknown as WebSocket, 2);

    const join3 = sfu.joinRoom('cap-room', 'peer3', ws3 as unknown as WebSocket, 2);
    expect(join3.success).toBe(false);
    expect(join3.error).toBe('SFU_ROOM_FULL');
  });

  it('should register producers and notify room participants', () => {
    const sfu = new SfuRelay();
    const wsAlice = new MockWebSocket();
    const wsBob = new MockWebSocket();

    sfu.joinRoom('media-room', 'alice', wsAlice as unknown as WebSocket);
    sfu.joinRoom('media-room', 'bob', wsBob as unknown as WebSocket);

    const producer = sfu.registerProducer('media-room', 'alice', 'video', 'key-epoch-0');
    expect(producer).not.toBeNull();
    expect(producer?.kind).toBe('video');

    const bobNotice = wsBob.getLastMessage();
    expect(bobNotice).toEqual({
      type: 'sfu-new-producer',
      producer: producer,
    });
  });

  it('should blindly forward encrypted frames to all other peers without decrypting', () => {
    const sfu = new SfuRelay();
    const wsAlice = new MockWebSocket();
    const wsBob = new MockWebSocket();
    const wsCharlie = new MockWebSocket();

    sfu.joinRoom('stream-room', 'alice', wsAlice as unknown as WebSocket);
    sfu.joinRoom('stream-room', 'bob', wsBob as unknown as WebSocket);
    sfu.joinRoom('stream-room', 'charlie', wsCharlie as unknown as WebSocket);

    const producer = sfu.registerProducer('stream-room', 'alice', 'video', 'key-epoch-0')!;

    const encryptedFramePayload = 'SFRAME_AES_256_GCM_CIPHERTEXT_12345';
    const forwarded = sfu.forwardEncryptedFrame(
      'stream-room',
      'alice',
      producer.producerId,
      encryptedFramePayload
    );

    // Should forward to Bob and Charlie (2 peers)
    expect(forwarded).toBe(2);

    const bobPacket = wsBob.getLastMessage();
    expect(bobPacket).toEqual({
      type: 'sfu-frame-relay',
      producerId: producer.producerId,
      senderPeerId: 'alice',
      data: encryptedFramePayload,
    });

    const charliePacket = wsCharlie.getLastMessage();
    expect(charliePacket.data).toBe(encryptedFramePayload);
  });

  it('should clean up producers and teardown room on departure', () => {
    const sfu = new SfuRelay();
    const wsAlice = new MockWebSocket();

    sfu.joinRoom('cleanup-room', 'alice', wsAlice as unknown as WebSocket);
    sfu.registerProducer('cleanup-room', 'alice', 'audio', 'key-epoch-0');

    expect(sfu.getRoomStats('cleanup-room')?.peerCount).toBe(1);

    sfu.removePeer(wsAlice as unknown as WebSocket);
    expect(sfu.getRoomStats('cleanup-room')).toBeNull();
  });

  it('should route raw binary SFrame packets and parse packet structure correctly', () => {
    const sfu = new SfuRelay();
    const wsAlice = new MockWebSocket();
    const wsBob = new MockWebSocket();

    sfu.joinRoom('binary-room', 'alice', wsAlice as unknown as WebSocket);
    sfu.joinRoom('binary-room', 'bob', wsBob as unknown as WebSocket);

    const producer = sfu.registerProducer('binary-room', 'alice', 'video', 'key-0')!;
    const rawFrame = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0xaa, 0xbb, 0xcc, 0xdd]);

    const forwarded = sfu.routeSimulcastBinaryFrame(
      'binary-room',
      producer.producerId,
      'alice',
      'high',
      rawFrame
    );

    expect(forwarded).toBe(1);

    const sentToBob = wsBob.sentMessages[wsBob.sentMessages.length - 1];
    expect(Buffer.isBuffer(sentToBob)).toBe(true);

    const parsed = SfuRelay.parseBinaryPacket(sentToBob as Buffer);
    expect(parsed).not.toBeNull();
    expect(parsed?.producerId).toBe(producer.producerId);
    expect(parsed?.tier).toBe('high');
    expect(parsed?.payload).toEqual(rawFrame);
  });
});
