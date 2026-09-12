import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../src/server.js';
import { FastifyInstance } from 'fastify';

describe('Oblivious HTTP Relay (RFC 9458) & Push Notification Gateway', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = createServer();
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('RFC 9458 Oblivious HTTP Relay (/ohttp-relay)', () => {
    it('should forward encapsulated request to whitelisted target and return result', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/ohttp-relay',
        payload: {
          version: '1.0',
          targetPath: '/turn-credentials?peerId=test-peer',
          method: 'GET',
        },
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.payload);
      expect(json.version).toBe('1.0');
      expect(json.status).toBe(200);
      expect(json.body.username).toBeDefined();
      expect(json.body.credential).toBeDefined();
    });

    it('should block non-whitelisted targets to prevent SSRF', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/ohttp-relay',
        payload: {
          version: '1.0',
          targetPath: '/etc/passwd',
          method: 'GET',
        },
      });

      expect(response.statusCode).toBe(403);
      const json = JSON.parse(response.payload);
      expect(json.error).toMatch(/target forbidden/i);
    });

    it('should return 400 if targetPath is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/ohttp-relay',
        payload: {
          version: '1.0',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Mobile VoIP Push Gateway (/api/push)', () => {
    const peerDid = 'did:key:z6MkhaXgBZDvotDkL5257faiz48Z8x8L8x8L8x8L';

    it('should register a VoIP push token', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/push/register',
        payload: {
          peerDid,
          platform: 'ios',
          pushToken: 'apns-voip-sample-token-hex-12345',
        },
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.payload);
      expect(json.success).toBe(true);

      const statusRes = await server.inject({
        method: 'GET',
        url: `/api/push/status/${peerDid}`,
      });
      const statusJson = JSON.parse(statusRes.payload);
      expect(statusJson.registered).toBe(true);
      expect(statusJson.platform).toBe('ios');
    });

    it('should dispatch incoming call push packet when recipient is registered', async () => {
      // 1. Register recipient
      await server.inject({
        method: 'POST',
        url: '/api/push/register',
        payload: {
          peerDid,
          platform: 'android',
          pushToken: 'fcm-voip-sample-token-abcde',
        },
      });

      // 2. Dispatch call
      const callRes = await server.inject({
        method: 'POST',
        url: '/api/push/call',
        payload: {
          callerDid: 'did:key:zAegisCaller',
          callerName: 'Alice',
          recipientDid: peerDid,
          roomId: 'room-alpha-99',
          hasVideo: true,
        },
      });

      expect(callRes.statusCode).toBe(200);
      const callJson = JSON.parse(callRes.payload);
      expect(callJson.dispatched).toBe(true);
      expect(callJson.recipientFound).toBe(true);
      expect(callJson.platform).toBe('android');
      expect(callJson.packet.data.roomId).toBe('room-alpha-99');
    });

    it('should handle call dispatch when recipient is offline/unregistered gracefully', async () => {
      const callRes = await server.inject({
        method: 'POST',
        url: '/api/push/call',
        payload: {
          callerDid: 'did:key:zAegisCaller',
          callerName: 'Alice',
          recipientDid: 'did:key:zUnregistered',
          roomId: 'room-beta-12',
          hasVideo: false,
        },
      });

      expect(callRes.statusCode).toBe(200);
      const callJson = JSON.parse(callRes.payload);
      expect(callJson.dispatched).toBe(false);
      expect(callJson.recipientFound).toBe(false);
    });
  });
});
