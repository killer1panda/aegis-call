import { describe, it, expect } from 'vitest';
import { MatrixRTCBridge, MatrixCallMemberContent } from '../src/services/matrixRTCBridge.js';

describe('AegisCall Matrix 2.0 (MSC3401 / MatrixRTC) Bridge', () => {
  it('should construct with default and custom device IDs', () => {
    const bridgeDefault = new MatrixRTCBridge('room-matrix-1');
    expect(bridgeDefault).toBeDefined();

    const customDeviceId = 'device-custom-xyz-123';
    const bridgeCustom = new MatrixRTCBridge('room-matrix-2', customDeviceId);
    const event = bridgeCustom.generateCallMemberEvent('call-99', 'sess-42');
    expect(event['m.calls'][0]['m.devices'][0].device_id).toBe(customDeviceId);
  });

  it('should generate compliant MSC3401 state event content with sframe-mesh foci', () => {
    const bridge = new MatrixRTCBridge('room-alpha', 'aegis-device-local');
    const callId = 'call-uuid-101';
    const sessionId = 'session-k7-999';
    const hybridPkHex = 'a1b2c3d4e5f60718293a4b5c6d7e8f';

    const event = bridge.generateCallMemberEvent(callId, sessionId, hybridPkHex);

    expect(event['m.calls']).toHaveLength(1);
    const call = event['m.calls'][0];
    expect(call['m.call_id']).toBe(callId);

    const device = call['m.devices'][0];
    expect(device.device_id).toBe('aegis-device-local');
    expect(device.session_id).toBe(sessionId);
    expect(device.feeds).toEqual([{ purpose: 'm.usermedia' }]);
    expect(device.foci).toEqual([{ type: 'sframe-mesh' }]);
    expect(device.aegis_pqc_hybrid_pk).toBe(hybridPkHex);
  });

  it('should parse peer memberships and filter out local device ID', () => {
    const localId = 'local-device-001';
    const bridge = new MatrixRTCBridge('room-beta', localId);

    const incomingEvent: MatrixCallMemberContent = {
      'm.calls': [
        {
          'm.call_id': 'call-shared-1',
          'm.devices': [
            {
              device_id: localId, // Local device, should be filtered out
              session_id: 'sess-local',
              feeds: [{ purpose: 'm.usermedia' }],
              foci: [{ type: 'sframe-mesh' }],
              aegis_pqc_hybrid_pk: 'local-pk-hex',
            },
            {
              device_id: 'remote-peer-alice',
              session_id: 'sess-alice-77',
              feeds: [{ purpose: 'm.usermedia' }],
              foci: [{ type: 'sframe-mesh' }],
              aegis_pqc_hybrid_pk: 'alice-hybrid-pk-hex',
            },
            {
              device_id: 'remote-peer-bob',
              session_id: 'sess-bob-88',
              feeds: [{ purpose: 'm.usermedia' }],
              foci: [{ type: 'sframe-mesh' }],
              aegis_pqc_hybrid_pk: 'bob-hybrid-pk-hex',
            },
          ],
        },
      ],
    };

    const peers = bridge.parsePeerMembership(incomingEvent);
    expect(peers).toHaveLength(2);
    expect(peers[0]).toEqual({
      deviceId: 'remote-peer-alice',
      sessionId: 'sess-alice-77',
      hybridPublicKeyHex: 'alice-hybrid-pk-hex',
    });
    expect(peers[1]).toEqual({
      deviceId: 'remote-peer-bob',
      sessionId: 'sess-bob-88',
      hybridPublicKeyHex: 'bob-hybrid-pk-hex',
    });
  });

  it('should gracefully handle empty or absent calls structure', () => {
    const bridge = new MatrixRTCBridge('room-gamma');
    const emptyPeers = bridge.parsePeerMembership({ 'm.calls': [] });
    expect(emptyPeers).toEqual([]);

    const malformedPeers = bridge.parsePeerMembership({} as any);
    expect(malformedPeers).toEqual([]);
  });
});
