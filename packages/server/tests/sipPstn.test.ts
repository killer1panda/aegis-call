import { describe, it, expect } from 'vitest';
import { G711Codec, SipProtocolEngine, SipPstnGateway } from '../src/sipPstnGateway.js';
import { createServer } from '../src/server.js';
import dgram from 'dgram';

describe('Sovereign SIP Trunking & PSTN Gateway', () => {
  it('should encode and decode G.711 mu-law and A-law PCM with high speech fidelity', () => {
    // Generate a 440 Hz test sine wave at 8000 Hz sample rate
    const sampleCount = 800;
    const originalPcm = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      originalPcm[i] = 0.75 * Math.sin((2 * Math.PI * 440 * i) / 8000);
    }

    // Test PCMU (u-law)
    const muLawBytes = G711Codec.encodePcm(originalPcm, 'PCMU');
    expect(muLawBytes.length).toBe(sampleCount);

    const decodedMuPcm = G711Codec.decodePcm(muLawBytes, 'PCMU');
    expect(decodedMuPcm.length).toBe(sampleCount);

    // Assert low quantization error (< 0.05 RMS error)
    let muErrorSum = 0;
    for (let i = 0; i < sampleCount; i++) {
      muErrorSum += Math.abs(originalPcm[i] - decodedMuPcm[i]);
    }
    const avgMuError = muErrorSum / sampleCount;
    expect(avgMuError).toBeLessThan(0.03);

    // Test PCMA (A-law)
    const aLawBytes = G711Codec.encodePcm(originalPcm, 'PCMA');
    expect(aLawBytes.length).toBe(sampleCount);

    const decodedAPcm = G711Codec.decodePcm(aLawBytes, 'PCMA');
    expect(decodedAPcm.length).toBe(sampleCount);

    let aErrorSum = 0;
    for (let i = 0; i < sampleCount; i++) {
      aErrorSum += Math.abs(originalPcm[i] - decodedAPcm[i]);
    }
    const avgAError = aErrorSum / sampleCount;
    expect(avgAError).toBeLessThan(0.03);
  });

  it('should generate and parse RFC 3261 compliant SIP messages and SDP descriptions', () => {
    const fromUri = 'sip:alice@aegis.local';
    const toUri = 'sip:+15551234567@pstn-trunk.net';
    const callId = 'test-call-12345@aegis.local';
    const localTag = 'tag-alice-1';

    const invite = SipProtocolEngine.createInvite(fromUri, toUri, callId, localTag, '192.168.1.50');
    expect(invite).toContain('INVITE sip:+15551234567@pstn-trunk.net SIP/2.0');
    expect(invite).toContain('a=rtpmap:0 PCMU/8000');
    expect(invite).toContain(`Call-ID: ${callId}`);

    const parsed = SipProtocolEngine.parse(invite);
    expect(parsed.isRequest).toBe(true);
    expect(parsed.method).toBe('INVITE');
    expect(parsed.headers['call-id']).toBe(callId);
    expect(parsed.headers['content-type']).toBe('application/sdp');
    expect(parsed.body).toContain('m=audio 10000 RTP/AVP 0 8 101');

    // Create and parse 200 OK
    const ok = SipProtocolEngine.create200Ok(parsed, 'tag-bob-2', '192.168.1.100');
    expect(ok).toContain('SIP/2.0 200 OK');

    const parsedOk = SipProtocolEngine.parse(ok);
    expect(parsedOk.isRequest).toBe(false);
    expect(parsedOk.statusCode).toBe(200);
    expect(parsedOk.body).toContain('m=audio 10000 RTP/AVP 0 8');
  });

  it('should orchestrate SIP call state transitions (Calling -> Connected -> Terminated)', () => {
    const gateway = new SipPstnGateway('10.0.0.1');

    // 1. Initiate outgoing call
    const { session, sipInvite } = gateway.initiateCall(
      'sip:user@aegis.local',
      'sip:+18005550199@telephony.gateway',
      'room-secure-101'
    );

    expect(session.state).toBe('calling');
    expect(session.roomId).toBe('room-secure-101');
    expect(sipInvite).toContain('INVITE');

    // 2. Simulate 200 OK from carrier trunk
    const okResponse = [
      'SIP/2.0 200 OK',
      `Via: SIP/2.0/UDP 10.0.0.1:5060;branch=z9hG4bK-1;rport`,
      `From: <sip:user@aegis.local>;tag=${session.localTag}`,
      `To: <sip:+18005550199@telephony.gateway>;tag=carrier-tag-777`,
      `Call-ID: ${session.callId}`,
      `CSeq: 1 INVITE`,
      'Content-Length: 0',
      '',
      '',
    ].join('\r\n');

    const result = gateway.handleIncomingMessage(okResponse);
    expect(result.session?.state).toBe('connected');
    expect(result.session?.remoteTag).toBe('carrier-tag-777');

    // 3. Hang up call
    const { byeMessage, session: terminatedSession } = gateway.terminateCall(session.callId);
    expect(terminatedSession?.state).toBe('terminated');
    expect(byeMessage).toContain('BYE sip:+18005550199@telephony.gateway SIP/2.0');
    expect(byeMessage).toContain(`Call-ID: ${session.callId}`);
  });

  it('should handle incoming SIP INVITE from external PBX and auto-answer', () => {
    const gateway = new SipPstnGateway('10.0.0.1');

    const incomingInvite = [
      'INVITE sip:office@aegis.local SIP/2.0',
      'Via: SIP/2.0/UDP pbx.provider.com:5060;branch=z9hG4bK-999;rport',
      'From: <sip:+442071234567@pbx.provider.com>;tag=caller-abc',
      'To: <sip:office@aegis.local>',
      'Call-ID: external-call-999@provider',
      'CSeq: 1 INVITE',
      'Content-Type: application/sdp',
      'Content-Length: 10',
      '',
      'v=0\r\ns=test',
    ].join('\r\n');

    const { response, session } = gateway.handleIncomingMessage(incomingInvite);
    expect(response).toBeDefined();
    expect(response).toContain('SIP/2.0 200 OK');
    expect(session).toBeDefined();
    expect(session?.state).toBe('connected');
    expect(session?.fromUri).toBe('<sip:+442071234567@pbx.provider.com>;tag=caller-abc');
  });

  it('should expose Fastify REST API routes for SIP call initiation, inspection, and hangup', async () => {
    const server = createServer();

    // 1. Initiate SIP call via REST
    const callRes = await server.inject({
      method: 'POST',
      url: '/api/sip/call',
      payload: {
        toUri: 'sip:+12125550100@pstn.provider.net',
        roomId: 'room-telephony-test',
        codec: 'PCMU',
      },
    });

    expect(callRes.statusCode).toBe(200);
    const callData = JSON.parse(callRes.body);
    expect(callData.success).toBe(true);
    expect(callData.session.callId).toBeDefined();
    expect(callData.session.state).toBe('calling');

    const callId = callData.session.callId;

    // 2. Query session
    const statusRes = await server.inject({
      method: 'GET',
      url: `/api/sip/session/${encodeURIComponent(callId)}`,
    });

    expect(statusRes.statusCode).toBe(200);
    const statusData = JSON.parse(statusRes.body);
    expect(statusData.session.callId).toBe(callId);

    // 3. Hangup session
    const hangupRes = await server.inject({
      method: 'POST',
      url: `/api/sip/hangup/${encodeURIComponent(callId)}`,
    });

    expect(hangupRes.statusCode).toBe(200);
    const hangupData = JSON.parse(hangupRes.body);
    expect(hangupData.session.state).toBe('terminated');
    expect(hangupData.byeMessage).toContain('BYE');
  });

  it('should bind an authentic RFC 3261 UDP socket and handle SIP datagrams', async () => {
    const gateway = new SipPstnGateway('127.0.0.1');
    const port = await gateway.startUdpListener(0, '127.0.0.1');
    expect(port).toBeGreaterThan(0);

    const client = dgram.createSocket('udp4');
    const fromUri = 'sip:test@udp.client';
    const toUri = 'sip:aegis@gateway';
    const callId = `udp-test-${Date.now()}`;
    const invite = SipProtocolEngine.createInvite(fromUri, toUri, callId, 'tag-1', '127.0.0.1');

    const responsePromise = new Promise<string>((resolve) => {
      client.on('message', (msg) => {
        resolve(msg.toString('utf-8'));
      });
    });

    const inviteBuf = Buffer.from(invite, 'utf-8');
    client.send(inviteBuf, 0, inviteBuf.length, port, '127.0.0.1');

    const rawResponse = await responsePromise;
    expect(rawResponse).toContain('SIP/2.0 200 OK');
    expect(rawResponse).toContain(`Call-ID: ${callId}`);

    client.close();
    gateway.stopUdpListener();
  });
});
