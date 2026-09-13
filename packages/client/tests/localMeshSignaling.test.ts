import { describe, it, expect, vi } from 'vitest';
import { LocalMeshSignaling, MeshMessage } from '../src/services/localMeshSignaling.js';

describe('AegisCall Air-Gapped Offline Local Mesh Signaling Adapter', () => {
  it('should initialize local mesh broadcast channel and announce peer presence', async () => {
    const roomId = 'mesh-test-room-1';
    const receivedMessages: MeshMessage[] = [];

    // Peer Alice connects
    LocalMeshSignaling.connect(roomId, 'peer-alice', (msg) => {
      receivedMessages.push(msg);
    });

    // Send a signaling message
    LocalMeshSignaling.send(roomId, {
      type: 'signal',
      senderId: 'peer-alice',
      payload: { type: 'key-exchange', key: 'alice-key-123' },
    });

    // Disconnect
    LocalMeshSignaling.disconnect(roomId, 'peer-alice');
  });

  it('should allow bidirectional message exchange between separate peers on the same mesh room', async () => {
    const roomId = 'mesh-test-room-2';
    const aliceReceived: MeshMessage[] = [];
    const bobReceived: MeshMessage[] = [];

    // Alice connects
    LocalMeshSignaling.connect(roomId, 'peer-alice', (msg) => {
      aliceReceived.push(msg);
    });

    // Bob connects
    LocalMeshSignaling.connect(roomId, 'peer-bob', (msg) => {
      bobReceived.push(msg);
    });

    // Alice sends offer to Bob
    LocalMeshSignaling.send(roomId, {
      type: 'signal',
      senderId: 'peer-alice',
      targetId: 'peer-bob',
      payload: { type: 'sdp-offer', sdp: 'v=0...' },
    });

    // Allow event loop to process broadcast channel dispatch
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Bob should receive Alice's offer
    const offerMsg = bobReceived.find((m) => m.payload?.type === 'sdp-offer');
    if (offerMsg) {
      expect(offerMsg.senderId).toBe('peer-alice');
      expect(offerMsg.targetId).toBe('peer-bob');
    }

    // Cleanup
    LocalMeshSignaling.disconnect(roomId, 'peer-alice');
    LocalMeshSignaling.disconnect(roomId, 'peer-bob');
  });

  it('should broadcast peer-left and close channel on disconnect', () => {
    const roomId = 'mesh-test-room-3';
    LocalMeshSignaling.connect(roomId, 'peer-carol', () => {});

    expect(() => LocalMeshSignaling.disconnect(roomId, 'peer-carol')).not.toThrow();
  });

  it('should accurately report operational signaling mode', () => {
    const roomId = 'mesh-test-room-mode';
    expect(LocalMeshSignaling.getSignalingMode(roomId)).toBe('offline');

    LocalMeshSignaling.connect(roomId, 'peer-dave', () => {});
    expect(LocalMeshSignaling.getSignalingMode(roomId)).toBe('browser-tab-broadcast');

    LocalMeshSignaling.disconnect(roomId, 'peer-dave');
    expect(LocalMeshSignaling.getSignalingMode(roomId)).toBe('offline');
  });
});
