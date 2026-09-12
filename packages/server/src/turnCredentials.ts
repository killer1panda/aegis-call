import crypto from 'crypto';

export interface TurnServerCredentials {
  username: string;
  credential: string;
  urls: string[];
  ttl: number;
  expiresAt: number;
}

export interface TurnConfig {
  secret: string;
  realm: string;
  stunUrl: string;
  turnUrls: string[];
  defaultTtlSeconds?: number;
}

const DEFAULT_TURN_CONFIG: TurnConfig = {
  secret: process.env.TURN_SHARED_SECRET || 'aegis-dev-ephemeral-turn-secret-change-in-prod',
  realm: process.env.TURN_REALM || 'turn.aegiscall.io',
  stunUrl: 'stun:turn.aegiscall.io:3478',
  turnUrls: [
    'turn:turn.aegiscall.io:3478?transport=udp',
    'turn:turn.aegiscall.io:3478?transport=tcp',
    'turns:turn.aegiscall.io:5349?transport=tcp',
  ],
  defaultTtlSeconds: 86400, // 24 hours
};

/**
 * Generates dynamic, time-limited TURN credentials conforming to RFC 5766
 * (REST API for Access to TURN Services).
 *
 * username = <timestamp>:<username-or-peer-id>
 * credential = base64(HMAC-SHA1(<username>, <turn-secret>))
 */
export function generateEphemeralTurnCredentials(
  peerId: string,
  config: TurnConfig = DEFAULT_TURN_CONFIG,
  ttlSeconds: number = config.defaultTtlSeconds ?? 86400
): TurnServerCredentials {
  const nowUnix = Math.floor(Date.now() / 1000);
  const expiresAt = nowUnix + ttlSeconds;
  const username = `${expiresAt}:${peerId}`;

  const hmac = crypto.createHmac('sha1', config.secret);
  hmac.update(username);
  const credential = hmac.digest('base64');

  const urls = [config.stunUrl, ...config.turnUrls];

  return {
    username,
    credential,
    urls,
    ttl: ttlSeconds,
    expiresAt,
  };
}

export { DEFAULT_TURN_CONFIG };
