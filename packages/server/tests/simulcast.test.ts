import { describe, it, expect, vi } from 'vitest';
import { SfuRelay } from '../src/sfuRelay.js';
import { WebSocket } from 'ws';

function createMockSocket(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

describe('Blind SFU Encrypted Simulcast & SVC Adaptation', () => {
  it('should route encrypted frames according to consumer tier preferences', () => {
    const sfu = new SfuRelay();
    const roomId = 'room-simulcast-test';

    const socketAlice = createMockSocket();
    const socketBob = createMockSocket();
    const socketCharlie = createMockSocket();

    sfu.joinRoom(roomId, 'alice', socketAlice);
    sfu.joinRoom(roomId, 'bob', socketBob);
    sfu.joinRoom(roomId, 'charlie', socketCharlie);

    const producer = sfu.registerProducer(roomId, 'alice', 'video', 'key-video-01');
    expect(producer).toBeDefined();
    const producerId = producer!.producerId;

    // Bob prefers High (Desktop on fiber)
    sfu.setConsumerTier(roomId, 'bob', producerId, 'high');
    // Charlie prefers Low (Mobile on cellular)
    sfu.setConsumerTier(roomId, 'charlie', producerId, 'low');

    // 1. Forward Low tier frame
    const forwardedLow = sfu.forwardEncryptedSimulcastFrame(
      roomId,
      'alice',
      producerId,
      'ciphertext-low-360p',
      'low',
      0,
      0
    );

    // Only Charlie receives Low tier
    expect(forwardedLow).toBe(1);
    expect(socketCharlie.send).toHaveBeenCalled();

    // 2. Forward High tier frame
    vi.clearAllMocks();
    const forwardedHigh = sfu.forwardEncryptedSimulcastFrame(
      roomId,
      'alice',
      producerId,
      'ciphertext-high-1080p',
      'high',
      2,
      2
    );

    // Only Bob receives High tier
    expect(forwardedHigh).toBe(1);
    expect(socketBob.send).toHaveBeenCalled();
    expect(socketCharlie.send).not.toHaveBeenCalled();

    // 3. Charlie switches to High tier
    sfu.setConsumerTier(roomId, 'charlie', producerId, 'high');
    vi.clearAllMocks();

    const forwardedHigh2 = sfu.forwardEncryptedSimulcastFrame(
      roomId,
      'alice',
      producerId,
      'ciphertext-high-1080p-second',
      'high',
      2,
      2
    );

    // Both Bob and Charlie receive High tier
    expect(forwardedHigh2).toBe(2);
    expect(socketBob.send).toHaveBeenCalled();
    expect(socketCharlie.send).toHaveBeenCalled();
  });
});
