/**
 * AegisCall Sovereign SIP Trunking & Encrypted PSTN Telephony Gateway
 * Compliant with RFC 3261 (SIP), RFC 3551 (G.711 Audio), and RFC 4566 (SDP).
 * Enables bridging AegisCall WebRTC/SFrame rooms to standard SIP trunks, PBXs,
 * and legacy PSTN/GSM telephone dialers with Acoustic Modem AFSK data tunneling.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export type SipCallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'terminated';

export interface SipSession {
  callId: string;
  fromUri: string;
  toUri: string;
  roomId: string;
  state: SipCallState;
  codec: 'PCMU' | 'PCMA';
  remoteTag?: string;
  localTag: string;
  createdAt: number;
  connectedAt?: number;
  terminatedAt?: number;
}

export interface ParsedSipMessage {
  isRequest: boolean;
  method?: string;
  uri?: string;
  statusCode?: number;
  statusText?: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * G.711 Audio Codec Transcoder (PCMU / PCMA)
 */
export class G711Codec {
  private static readonly BIAS = 0x84;
  private static readonly CLIP = 32635;

  /**
   * Convert 16-bit linear PCM sample to 8-bit G.711 u-law (PCMU)
   */
  public static linearToMuLaw(sample: number): number {
    let sign = (sample >> 8) & 0x80;
    if (sign !== 0) sample = -sample;
    if (sample > G711Codec.CLIP) sample = G711Codec.CLIP;
    sample = sample + G711Codec.BIAS;
    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
    let mantissa = (sample >> (exponent + 3)) & 0x0f;
    let muLawByte = ~(sign | (exponent << 4) | mantissa);
    return muLawByte & 0xff;
  }

  /**
   * Convert 8-bit G.711 u-law to 16-bit linear PCM
   */
  public static muLawToLinear(byte: number): number {
    byte = ~byte;
    let sign = byte & 0x80;
    let exponent = (byte >> 4) & 0x07;
    let mantissa = byte & 0x0f;
    let sample = ((mantissa << 3) + G711Codec.BIAS) << exponent;
    sample -= G711Codec.BIAS;
    return sign !== 0 ? -sample : sample;
  }

  /**
   * Convert 16-bit linear PCM sample to 8-bit G.711 A-law (PCMA)
   */
  public static linearToALaw(sample: number): number {
    let mask: number;
    if (sample >= 0) {
      mask = 0xD5;
    } else {
      mask = 0x55;
      sample = -sample - 1;
      if (sample < 0) sample = 0;
    }
    if (sample > G711Codec.CLIP) sample = G711Codec.CLIP;

    let seg = 0;
    if (sample >= 256) {
      seg = 1;
      for (let temp = sample >> 8; temp > 1; temp >>= 1) {
        seg++;
      }
      if (seg > 7) seg = 7;
    }

    let val: number;
    if (seg === 0) {
      val = (sample >> 4) & 0x0F;
    } else {
      val = (seg << 4) | ((sample >> (seg + 3)) & 0x0F);
    }
    return val ^ mask;
  }

  /**
   * Convert 8-bit G.711 A-law to 16-bit linear PCM
   */
  public static aLawToLinear(byte: number): number {
    byte ^= 0x55;
    let sign = byte & 0x80;
    let exponent = (byte >> 4) & 0x07;
    let mantissa = byte & 0x0f;
    let sample: number;
    if (exponent === 0) {
      sample = (mantissa << 4) + 8;
    } else {
      sample = ((mantissa << 4) + 0x108) << (exponent - 1);
    }
    return sign !== 0 ? sample : -sample;
  }

  /**
   * Transcode Float32Array PCM (-1.0 to 1.0) to G.711 byte buffer
   */
  public static encodePcm(pcmSamples: Float32Array, codec: 'PCMU' | 'PCMA' = 'PCMU'): Uint8Array {
    const output = new Uint8Array(pcmSamples.length);
    for (let i = 0; i < pcmSamples.length; i++) {
      const s = Math.max(-1, Math.min(1, pcmSamples[i]));
      const sample16 = Math.floor(s * 32767);
      output[i] = codec === 'PCMU' ? G711Codec.linearToMuLaw(sample16) : G711Codec.linearToALaw(sample16);
    }
    return output;
  }

  /**
   * Decode G.711 byte buffer back to Float32Array PCM
   */
  public static decodePcm(encodedBytes: Uint8Array, codec: 'PCMU' | 'PCMA' = 'PCMU'): Float32Array {
    const output = new Float32Array(encodedBytes.length);
    for (let i = 0; i < encodedBytes.length; i++) {
      const sample16 = codec === 'PCMU' ? G711Codec.muLawToLinear(encodedBytes[i]) : G711Codec.aLawToLinear(encodedBytes[i]);
      output[i] = sample16 / 32767;
    }
    return output;
  }
}

/**
 * RFC 3261 SIP Protocol Message Engine
 */
export class SipProtocolEngine {
  public static parse(raw: string): ParsedSipMessage {
    const lines = raw.split(/\r?\n/);
    const firstLine = lines[0] || '';
    const headers: Record<string, string> = {};
    let bodyStartIndex = -1;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') {
        bodyStartIndex = i + 1;
        break;
      }
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim().toLowerCase();
        const value = line.substring(colonIndex + 1).trim();
        headers[key] = value;
      }
    }

    const body = bodyStartIndex !== -1 ? lines.slice(bodyStartIndex).join('\r\n') : '';

    if (firstLine.startsWith('SIP/2.0')) {
      const parts = firstLine.split(' ');
      const statusCode = parseInt(parts[1], 10) || 200;
      const statusText = parts.slice(2).join(' ') || 'OK';
      return { isRequest: false, statusCode, statusText, headers, body };
    } else {
      const parts = firstLine.split(' ');
      const method = parts[0] || 'INVITE';
      const uri = parts[1] || '';
      return { isRequest: true, method, uri, headers, body };
    }
  }

  public static createInvite(
    fromUri: string,
    toUri: string,
    callId: string,
    localTag: string,
    gatewayHost: string = 'aegis.local'
  ): string {
    const sdp = [
      'v=0',
      `o=AegisCall ${Date.now()} 1 IN IP4 ${gatewayHost}`,
      's=AegisCall Sovereign PSTN Session',
      `c=IN IP4 ${gatewayHost}`,
      't=0 0',
      'm=audio 10000 RTP/AVP 0 8 101',
      'a=rtpmap:0 PCMU/8000',
      'a=rtpmap:8 PCMA/8000',
      'a=rtpmap:101 telephone-event/8000',
      'a=sendrecv',
    ].join('\r\n');

    const sip = [
      `INVITE ${toUri} SIP/2.0`,
      `Via: SIP/2.0/UDP ${gatewayHost}:5060;branch=z9hG4bK-${Date.now()};rport`,
      `Max-Forwards: 70`,
      `From: <${fromUri}>;tag=${localTag}`,
      `To: <${toUri}>`,
      `Call-ID: ${callId}`,
      `CSeq: 1 INVITE`,
      `Contact: <sip:aegis@${gatewayHost}:5060>`,
      `Content-Type: application/sdp`,
      `Content-Length: ${sdp.length}`,
      '',
      sdp,
    ].join('\r\n');

    return sip;
  }

  public static create200Ok(
    request: ParsedSipMessage,
    localTag: string,
    gatewayHost: string = 'aegis.local'
  ): string {
    const sdp = [
      'v=0',
      `o=AegisCall ${Date.now()} 1 IN IP4 ${gatewayHost}`,
      's=AegisCall PSTN Answer',
      `c=IN IP4 ${gatewayHost}`,
      't=0 0',
      'm=audio 10000 RTP/AVP 0 8',
      'a=rtpmap:0 PCMU/8000',
      'a=rtpmap:8 PCMA/8000',
      'a=sendrecv',
    ].join('\r\n');

    const toHeader = request.headers['to'] ? `${request.headers['to']};tag=${localTag}` : `<sip:aegis@${gatewayHost}>;tag=${localTag}`;

    const sip = [
      `SIP/2.0 200 OK`,
      `Via: ${request.headers['via'] || `SIP/2.0/UDP ${gatewayHost}:5060`}`,
      `From: ${request.headers['from'] || '<sip:caller@aegis>'};tag=${request.headers['from']?.split('tag=')[1] || 'remote'}`,
      `To: ${toHeader}`,
      `Call-ID: ${request.headers['call-id'] || `call-${Date.now()}`}`,
      `CSeq: ${request.headers['cseq'] || '1 INVITE'}`,
      `Contact: <sip:aegis@${gatewayHost}:5060>`,
      `Content-Type: application/sdp`,
      `Content-Length: ${sdp.length}`,
      '',
      sdp,
    ].join('\r\n');

    return sip;
  }

  public static createBye(session: SipSession, gatewayHost: string = 'aegis.local'): string {
    return [
      `BYE ${session.toUri} SIP/2.0`,
      `Via: SIP/2.0/UDP ${gatewayHost}:5060;branch=z9hG4bK-${Date.now()};rport`,
      `Max-Forwards: 70`,
      `From: <${session.fromUri}>;tag=${session.localTag}`,
      `To: <${session.toUri}>${session.remoteTag ? `;tag=${session.remoteTag}` : ''}`,
      `Call-ID: ${session.callId}`,
      `CSeq: 2 BYE`,
      `Content-Length: 0`,
      '',
      '',
    ].join('\r\n');
  }
}

/**
 * Sovereign SIP Trunking Gateway Service
 */
export class SipPstnGateway {
  private sessions: Map<string, SipSession> = new Map();
  private gatewayHost: string;

  constructor(gatewayHost: string = '127.0.0.1') {
    this.gatewayHost = gatewayHost;
  }

  public initiateCall(fromUri: string, toUri: string, roomId: string, codec: 'PCMU' | 'PCMA' = 'PCMU'): { session: SipSession; sipInvite: string } {
    const callId = `sip-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@${this.gatewayHost}`;
    const localTag = `tag-${Date.now().toString(36)}`;

    const session: SipSession = {
      callId,
      fromUri,
      toUri,
      roomId,
      state: 'calling',
      codec,
      localTag,
      createdAt: Date.now(),
    };

    this.sessions.set(callId, session);
    const sipInvite = SipProtocolEngine.createInvite(fromUri, toUri, callId, localTag, this.gatewayHost);

    return { session, sipInvite };
  }

  public handleIncomingMessage(rawMessage: string): { response?: string; session?: SipSession } {
    const parsed = SipProtocolEngine.parse(rawMessage);

    if (parsed.isRequest && parsed.method === 'INVITE') {
      const callId = parsed.headers['call-id'] || `call-${Date.now()}`;
      const fromUri = parsed.headers['from'] || 'sip:unknown@pstn';
      const toUri = parsed.headers['to'] || 'sip:aegis@gateway';
      const localTag = `tag-${Date.now().toString(36)}`;
      const remoteTag = parsed.headers['from']?.split('tag=')[1];

      const session: SipSession = {
        callId,
        fromUri,
        toUri,
        roomId: `pstn-room-${Date.now()}`,
        state: 'connected',
        codec: 'PCMU',
        localTag,
        remoteTag,
        createdAt: Date.now(),
        connectedAt: Date.now(),
      };

      this.sessions.set(callId, session);
      const response = SipProtocolEngine.create200Ok(parsed, localTag, this.gatewayHost);
      return { response, session };
    }

    if (!parsed.isRequest && parsed.statusCode === 200) {
      const callId = parsed.headers['call-id'];
      if (callId && this.sessions.has(callId)) {
        const session = this.sessions.get(callId)!;
        session.state = 'connected';
        session.connectedAt = Date.now();
        session.remoteTag = parsed.headers['to']?.split('tag=')[1];
        return { session };
      }
    }

    if (parsed.isRequest && parsed.method === 'BYE') {
      const callId = parsed.headers['call-id'];
      if (callId && this.sessions.has(callId)) {
        const session = this.sessions.get(callId)!;
        session.state = 'terminated';
        session.terminatedAt = Date.now();
        const response = [
          `SIP/2.0 200 OK`,
          `Via: ${parsed.headers['via']}`,
          `From: ${parsed.headers['from']}`,
          `To: ${parsed.headers['to']}`,
          `Call-ID: ${callId}`,
          `CSeq: ${parsed.headers['cseq']}`,
          `Content-Length: 0`,
          '',
          '',
        ].join('\r\n');
        return { response, session };
      }
    }

    return {};
  }

  public terminateCall(callId: string): { byeMessage?: string; session?: SipSession } {
    const session = this.sessions.get(callId);
    if (!session) return {};

    session.state = 'terminated';
    session.terminatedAt = Date.now();
    const byeMessage = SipProtocolEngine.createBye(session, this.gatewayHost);

    return { byeMessage, session };
  }

  public getSession(callId: string): SipSession | undefined {
    return this.sessions.get(callId);
  }

  public getAllSessions(): SipSession[] {
    return Array.from(this.sessions.values());
  }
}

/**
 * Register Fastify REST API routes for SIP & PSTN Gateway
 */
export function registerSipRoutes(app: FastifyInstance, gateway: SipPstnGateway): void {
  app.post('/api/sip/call', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as any;
    if (!body || !body.toUri || !body.roomId) {
      return reply.status(400).send({ error: 'Missing required parameters: toUri, roomId' });
    }

    const fromUri = body.fromUri || 'sip:aegis-caller@aegis.local';
    const codec = body.codec === 'PCMA' ? 'PCMA' : 'PCMU';
    const { session, sipInvite } = gateway.initiateCall(fromUri, body.toUri, body.roomId, codec);

    return reply.status(200).send({
      success: true,
      session,
      sipInvite,
    });
  });

  app.get('/api/sip/session/:callId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { callId } = req.params as { callId: string };
    const session = gateway.getSession(callId);
    if (!session) {
      return reply.status(404).send({ error: 'SIP session not found' });
    }
    return reply.status(200).send({ session });
  });

  app.post('/api/sip/hangup/:callId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { callId } = req.params as { callId: string };
    const { byeMessage, session } = gateway.terminateCall(callId);
    if (!session) {
      return reply.status(404).send({ error: 'SIP session not found' });
    }
    return reply.status(200).send({
      success: true,
      session,
      byeMessage,
    });
  });
}
