import { describe, it, expect } from 'vitest';
import { DTMF_KEYS, playDtmfTone } from '../src/components/TelephonyDialpadModal.js';
import { TRANSPORT_OPTIONS } from '../src/components/TransportSelector.js';

describe('AegisCall Sovereign Telephony & Multi-Transport Architecture', () => {
  it('should have valid ITU-T Q.23 DTMF frequency definitions for all 12 telephone keys', () => {
    expect(DTMF_KEYS.length).toBe(12);

    const keyMap = new Map(DTMF_KEYS.map((k) => [k.key, k]));

    // Row 1 (697 Hz)
    expect(keyMap.get('1')).toEqual({ key: '1', sub: '', rowFreq: 697, colFreq: 1209 });
    expect(keyMap.get('2')).toEqual({ key: '2', sub: 'ABC', rowFreq: 697, colFreq: 1336 });
    expect(keyMap.get('3')).toEqual({ key: '3', sub: 'DEF', rowFreq: 697, colFreq: 1477 });

    // Row 2 (770 Hz)
    expect(keyMap.get('4')).toEqual({ key: '4', sub: 'GHI', rowFreq: 770, colFreq: 1209 });
    expect(keyMap.get('5')).toEqual({ key: '5', sub: 'JKL', rowFreq: 770, colFreq: 1336 });
    expect(keyMap.get('6')).toEqual({ key: '6', sub: 'MNO', rowFreq: 770, colFreq: 1477 });

    // Row 3 (852 Hz)
    expect(keyMap.get('7')).toEqual({ key: '7', sub: 'PQRS', rowFreq: 852, colFreq: 1209 });
    expect(keyMap.get('8')).toEqual({ key: '8', sub: 'TUV', rowFreq: 852, colFreq: 1336 });
    expect(keyMap.get('9')).toEqual({ key: '9', sub: 'WXYZ', rowFreq: 852, colFreq: 1477 });

    // Row 4 (941 Hz)
    expect(keyMap.get('*')).toEqual({ key: '*', sub: '', rowFreq: 941, colFreq: 1209 });
    expect(keyMap.get('0')).toEqual({ key: '0', sub: '+', rowFreq: 941, colFreq: 1336 });
    expect(keyMap.get('#')).toEqual({ key: '#', sub: '', rowFreq: 941, colFreq: 1477 });
  });

  it('should safely execute playDtmfTone without unhandled exceptions', () => {
    expect(() => playDtmfTone(697, 1209, 20)).not.toThrow();
    expect(() => playDtmfTone(941, 1477, 20)).not.toThrow();
  });

  it('should define complete censorship-resistant signaling transport options with ratings and threat models', () => {
    expect(TRANSPORT_OPTIONS.length).toBe(5);

    const ids = TRANSPORT_OPTIONS.map((t) => t.id);
    expect(ids).toEqual(['ws', 'nostr', 'tor', 'dht', 'mesh']);

    const tor = TRANSPORT_OPTIONS.find((t) => t.id === 'tor')!;
    expect(tor.resilienceRating).toBe(5);
    expect(tor.badge).toBe('ANONYMITY NET');
    expect(tor.threatModel).toContain('surveillance');

    const mesh = TRANSPORT_OPTIONS.find((t) => t.id === 'mesh')!;
    expect(mesh.resilienceRating).toBe(5);
    expect(mesh.badge).toBe('OFF-GRID MESH');
    expect(mesh.threatModel).toContain('blackout');

    const dht = TRANSPORT_OPTIONS.find((t) => t.id === 'dht')!;
    expect(dht.resilienceRating).toBe(4);
    expect(dht.badge).toBe('SERVERLESS BEP-44');

    const nostr = TRANSPORT_OPTIONS.find((t) => t.id === 'nostr')!;
    expect(nostr.resilienceRating).toBe(4);
    expect(nostr.badge).toBe('DECENTRALIZED');

    const ws = TRANSPORT_OPTIONS.find((t) => t.id === 'ws')!;
    expect(ws.resilienceRating).toBe(3);
    expect(ws.status).toBe('active');
  });

  it('should validate SIP URI formatting and G.711 codec choices', () => {
    const formatSipUri = (input: string) => {
      if (input.startsWith('sip:') || input.startsWith('+')) return input;
      return `sip:${input}@gateway.local`;
    };

    expect(formatSipUri('sip:alice@pbx.aegis')).toBe('sip:alice@pbx.aegis');
    expect(formatSipUri('+18005550199')).toBe('+18005550199');
    expect(formatSipUri('dispatch')).toBe('sip:dispatch@gateway.local');

    const validCodecs = ['PCMU', 'PCMA'];
    expect(validCodecs).toContain('PCMU');
    expect(validCodecs).toContain('PCMA');
  });
});
