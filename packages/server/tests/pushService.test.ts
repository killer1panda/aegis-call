import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { PushService } from '../src/pushService.js';

describe('AegisCall PushService (VoIP APNs & FCM Dispatch)', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    PushService.clearRegistrations();
    server = Fastify();
    PushService.registerRoutes(server);
    await server.ready();
  });

  afterEach(async () => {
    PushService.clearRegistrations();
    await server.close();
  });

  it('should register iOS and Android device tokens', async () => {
    const resIos = await server.inject({
      method: 'POST',
      url: '/api/push/register',
      payload: {
        peerDid: 'did:aegis:ios-alice',
        platform: 'ios',
        pushToken: 'apns-device-token-1234567890abcdef',
      },
    });

    expect(resIos.statusCode).toBe(200);
    const bodyIos = JSON.parse(resIos.body);
    expect(bodyIos.success).toBe(true);

    const statusRes = await server.inject({
      method: 'GET',
      url: '/api/push/status/did:aegis:ios-alice',
    });
    const statusBody = JSON.parse(statusRes.body);
    expect(statusBody.registered).toBe(true);
    expect(statusBody.platform).toBe('ios');
  });

  it('should dispatch call notification and transparently report simulation when credentials absent', async () => {
    // Register recipient
    await server.inject({
      method: 'POST',
      url: '/api/push/register',
      payload: {
        peerDid: 'did:aegis:recipient-bob',
        platform: 'ios',
        pushToken: 'apns-bob-token',
      },
    });

    const callRes = await server.inject({
      method: 'POST',
      url: '/api/push/call',
      payload: {
        callerDid: 'did:aegis:caller-alice',
        callerName: 'Alice Operator',
        recipientDid: 'did:aegis:recipient-bob',
        roomId: 'classified-room-99',
        hasVideo: true,
      },
    });

    expect(callRes.statusCode).toBe(200);
    const callBody = JSON.parse(callRes.body);
    expect(callBody.dispatched).toBe(true);
    expect(callBody.simulated).toBe(true);
    expect(callBody.transport).toBe('apns-simulator');
    expect(callBody.recipientFound).toBe(true);
    expect(callBody.packet.apnsHeaders['apns-push-type']).toBe('voip');
    expect(callBody.packet.data.roomId).toBe('classified-room-99');
  });

  it('should handle missing recipient registration gracefully', async () => {
    const callRes = await server.inject({
      method: 'POST',
      url: '/api/push/call',
      payload: {
        callerDid: 'did:aegis:caller-alice',
        recipientDid: 'did:aegis:unregistered-charlie',
        roomId: 'room-fallback-1',
      },
    });

    expect(callRes.statusCode).toBe(200);
    const callBody = JSON.parse(callRes.body);
    expect(callBody.dispatched).toBe(false);
    expect(callBody.recipientFound).toBe(false);
    expect(callBody.message).toContain('Falling back to in-band signaling');
  });
});
