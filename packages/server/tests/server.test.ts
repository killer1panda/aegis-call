import { describe, it, expect } from 'vitest';
import { RoomManager } from '../src/roomManager.js';
import { WebSocket } from 'ws';

// Mock WebSocket class for unit testing RoomManager
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

describe('Aegis Signaling RoomManager', () => {
  it('should allow first peer to join as initiator', () => {
    const manager = new RoomManager();
    const ws1 = new MockWebSocket() as unknown as WebSocket;

    const result = manager.joinRoom('room-alpha', 'peer-alice', ws1);
    expect(result.success).toBe(true);
    expect(result.isInitiator).toBe(true);
    expect(result.peersInRoom).toEqual(['peer-alice']);
    expect(manager.getActiveRoomCount()).toBe(1);
  });

  it('should allow second peer to join and notify first peer', () => {
    const manager = new RoomManager();
    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();

    manager.joinRoom('room-alpha', 'peer-alice', ws1 as unknown as WebSocket);
    const result = manager.joinRoom('room-alpha', 'peer-bob', ws2 as unknown as WebSocket);

    expect(result.success).toBe(true);
    expect(result.isInitiator).toBe(false);
    expect(result.peersInRoom).toEqual(['peer-alice', 'peer-bob']);

    // Check that Alice received 'peer-joined' notification
    const lastMsgToAlice = ws1.getLastMessage();
    expect(lastMsgToAlice).toEqual({
      type: 'peer-joined',
      peerId: 'peer-bob',
    });
  });

  it('should enforce room capacity limit and reject excess peers when configured', () => {
    const manager = new RoomManager(2);
    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();
    const ws3 = new MockWebSocket();

    manager.joinRoom('room-alpha', 'peer-alice', ws1 as unknown as WebSocket);
    manager.joinRoom('room-alpha', 'peer-bob', ws2 as unknown as WebSocket);
    const result3 = manager.joinRoom('room-alpha', 'peer-eve', ws3 as unknown as WebSocket);

    expect(result3.success).toBe(false);
    expect(result3.error).toBe('ROOM_FULL');
  });

  it('should support up to 8 peers by default for multi-party SFU conferences', () => {
    const manager = new RoomManager();
    for (let i = 1; i <= 8; i++) {
      const ws = new MockWebSocket();
      const res = manager.joinRoom('room-sfu', `peer-${i}`, ws as unknown as WebSocket);
      expect(res.success).toBe(true);
    }
    const excessWs = new MockWebSocket();
    const excessRes = manager.joinRoom('room-sfu', 'peer-9', excessWs as unknown as WebSocket);
    expect(excessRes.success).toBe(false);
    expect(excessRes.error).toBe('ROOM_FULL');
  });

  it('should route signals between participants in the same room', () => {
    const manager = new RoomManager();
    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();

    manager.joinRoom('room-alpha', 'peer-alice', ws1 as unknown as WebSocket);
    manager.joinRoom('room-alpha', 'peer-bob', ws2 as unknown as WebSocket);

    const routed = manager.routeSignal(
      ws1 as unknown as WebSocket,
      'peer-bob',
      { type: 'key-exchange', publicKeyHex: 'abcdef123456' }
    );

    expect(routed).toBe(true);
    const receivedByBob = ws2.getLastMessage();
    expect(receivedByBob).toEqual({
      type: 'signal',
      senderPeerId: 'peer-alice',
      data: { type: 'key-exchange', publicKeyHex: 'abcdef123456' },
    });
  });

  it('should notify remaining peer and destroy room on disconnect', () => {
    const manager = new RoomManager();
    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();

    manager.joinRoom('room-alpha', 'peer-alice', ws1 as unknown as WebSocket);
    manager.joinRoom('room-alpha', 'peer-bob', ws2 as unknown as WebSocket);

    manager.handleDisconnect(ws1 as unknown as WebSocket);

    const receivedByBob = ws2.getLastMessage();
    expect(receivedByBob).toEqual({
      type: 'peer-left',
      peerId: 'peer-alice',
    });
    expect(manager.getRoomPeers('room-alpha')).toEqual(['peer-bob']);

    // Bob disconnects -> room destroyed
    manager.handleDisconnect(ws2 as unknown as WebSocket);
    expect(manager.getActiveRoomCount()).toBe(0);
  });
});
