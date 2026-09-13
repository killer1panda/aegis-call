import { describe, it, expect } from 'vitest';
import {
  ProtocolCamouflage,
  JA4_FINGERPRINTS,
} from '../src/protocolCamouflage.js';

describe('AegisCall Protocol Camouflage & JA4 Fingerprint Mimicry', () => {
  it('should wrap payloads in YouTube video streaming buffer profile', () => {
    const rawPayload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const wrapped = ProtocolCamouflage.wrap(rawPayload, 'youtube-stream');

    expect(wrapped.profile).toBe('youtube-stream');
    expect(wrapped.ja4Fingerprint).toBe(JA4_FINGERPRINTS.CHROME_DESKTOP);
    expect(wrapped.headers['content-type']).toContain('video/mp4');
    expect(wrapped.headers['server']).toBe('gvis');

    const unwrapped = ProtocolCamouflage.unwrap(wrapped);
    expect(unwrapped).toEqual(rawPayload);
  });

  it('should wrap payloads in Office 365 SharePoint synchronization profile', () => {
    const rawPayload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const wrapped = ProtocolCamouflage.wrap(rawPayload, 'sharepoint-sync');

    expect(wrapped.profile).toBe('sharepoint-sync');
    expect(wrapped.headers['x-sharepoint-version']).toBeDefined();
    expect(wrapped.headers['x-office365-tenant']).toBe('enterprise-shared-sync');

    const unwrapped = ProtocolCamouflage.unwrap(wrapped);
    expect(unwrapped).toEqual(rawPayload);
  });

  it('should wrap payloads in Zoom HTTPS profile and match Safari JA4 fingerprint', () => {
    const rawPayload = new Uint8Array([0xaa, 0xbb, 0xcc]);
    const wrapped = ProtocolCamouflage.wrap(rawPayload, 'zoom-https');

    expect(wrapped.profile).toBe('zoom-https');
    expect(wrapped.ja4Fingerprint).toBe(JA4_FINGERPRINTS.SAFARI_APPLE);
    expect(wrapped.headers['content-type']).toBe('application/x-zoom-media');

    const unwrapped = ProtocolCamouflage.unwrap(wrapped);
    expect(unwrapped).toEqual(rawPayload);
  });
});
