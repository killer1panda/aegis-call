import { describe, it, expect } from 'vitest';
import { generateEphemeralTurnCredentials } from '../src/turnCredentials.js';
import { createServer } from '../src/server.js';

describe('RFC 5766 Ephemeral TURN Credentials & REST Endpoint', () => {
  it('should generate valid time-limited TURN credentials', () => {
    const peerId = 'peer-test-client-01';
    const creds = generateEphemeralTurnCredentials(peerId);

    expect(creds.username).toContain(peerId);
    expect(creds.credential.length).toBeGreaterThan(16);
    expect(creds.urls.length).toBeGreaterThanOrEqual(3);
    expect(creds.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(creds.urls.some((u) => u.startsWith('turns:'))).toBe(true);
  });

  it('should serve /turn-credentials endpoint via HTTP REST', async () => {
    const server = createServer();
    const response = await server.inject({
      method: 'GET',
      url: '/turn-credentials?peerId=charlie-relay-test',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.username).toContain('charlie-relay-test');
    expect(body.credential).toBeDefined();
    expect(Array.isArray(body.urls)).toBe(true);
    expect(body.urls.length).toBeGreaterThan(0);

    await server.close();
  });
});
