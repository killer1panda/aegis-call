import { describe, it, expect } from 'vitest';
import { CallNotificationService, IncomingCallPayload } from '../src/callNotificationService.js';
import { BiometricAuthService } from '../src/biometricAuthService.js';

describe('Aegis Mobile CallNotificationService', () => {
  it('should register incoming call and trigger answer listener', async () => {
    let answeredPayload: IncomingCallPayload | null = null;
    const unsubscribe = CallNotificationService.onCallAnswered((payload) => {
      answeredPayload = payload;
    });

    const callPayload: IncomingCallPayload = {
      callId: 'call-test-123',
      callerDid: 'did:key:z6MkuTestPeer',
      callerName: 'Alice Vanguard',
      roomId: 'room-secure-456',
      hasVideo: true,
      isPostQuantum: true,
      timestamp: Date.now(),
    };

    await CallNotificationService.reportIncomingCall(callPayload);
    CallNotificationService.answerCall('call-test-123');

    expect(answeredPayload).not.toBeNull();
    expect(answeredPayload?.callId).toBe('call-test-123');
    expect(answeredPayload?.callerName).toBe('Alice Vanguard');
    expect(answeredPayload?.isPostQuantum).toBe(true);

    unsubscribe();
  });

  it('should notify reject listeners when a call ends', () => {
    let rejectedCallId: string | null = null;
    const unsubscribe = CallNotificationService.onCallRejected((id) => {
      rejectedCallId = id;
    });

    CallNotificationService.endCall('call-test-789');
    expect(rejectedCallId).toBe('call-test-789');

    unsubscribe();
  });
});

describe('Aegis Mobile BiometricAuthService', () => {
  it('should gracefully handle non-biometric environments with software fallback', async () => {
    const availability = await BiometricAuthService.checkAvailability();
    expect(typeof availability.available).toBe('boolean');
    expect(['face-id', 'touch-id', 'fingerprint', 'iris', 'webauthn', 'none']).toContain(availability.biometryType);

    const authResult = await BiometricAuthService.authenticate('Unit test biometric challenge');
    expect(authResult).toBeDefined();
    expect(authResult.timestamp).toBeGreaterThan(0);
  });
});

describe('Aegis Mobile MeshRadioAdapter', () => {
  it('should discover air-gapped radio peers and transmit mesh payloads', async () => {
    const { MeshRadioAdapter } = await import('../src/meshRadioAdapter.js');
    const adapter = MeshRadioAdapter.getInstance();

    let discoveredPeer: any = null;
    await adapter.startScanning('mesh-room-999', (peer) => {
      discoveredPeer = peer;
    });

    await adapter.startAdvertising('mesh-room-999', 'peer-alice-radio');

    // Simulate discovering an incoming beacon
    adapter.handleDiscoveredRadioBeacon('peer-bob-radio', 'mesh-room-999', -55, 'bluetooth-le');

    expect(discoveredPeer).not.toBeNull();
    expect(discoveredPeer?.peerId).toBe('peer-bob-radio');
    expect(discoveredPeer?.transport).toBe('bluetooth-le');
    expect(discoveredPeer?.rssi).toBe(-55);

    const sent = await adapter.sendMeshPayload('peer-bob-radio', 'v=0;sdp-offer');
    expect(sent).toBe(true);

    await adapter.stop();
  });
});

