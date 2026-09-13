/**
 * AegisCall Protocol Camouflage & JA4 Fingerprint Mimicry
 * Encapsulates WebRTC media & signaling traffic in benign wire profiles
 * (YouTube Video Streaming, Office 365 SharePoint Sync, Zoom HTTPS)
 * to bypass authoritarian Deep Packet Inspection (DPI) firewalls.
 */

export type CamouflageProfile = 'youtube-stream' | 'sharepoint-sync' | 'zoom-https';

export interface CamouflagedEnvelope {
  profile: CamouflageProfile;
  headers: Record<string, string>;
  ja4Fingerprint: string;
  payloadBase64: string;
  timestamp: number;
}

export const JA4_FINGERPRINTS = {
  // Chrome 124+ on Windows/macOS TLS 1.3 fingerprint
  CHROME_DESKTOP: 't13d1516h2_8daaf6152771_b93d42e70336',
  // Safari 17+ on macOS/iOS
  SAFARI_APPLE: 't13i1516h2_0167389e13b8_4070a25690b7',
};

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class ProtocolCamouflage {
  /**
   * Wraps an encrypted payload into a benign service envelope indistinguishable from common SaaS/CDN traffic.
   */
  public static wrap(
    payload: Uint8Array,
    profile: CamouflageProfile = 'youtube-stream'
  ): CamouflagedEnvelope {
    const payloadBase64 = uint8ToBase64(payload);
    const timestamp = Date.now();

    switch (profile) {
      case 'youtube-stream':
        return {
          profile,
          headers: {
            'content-type': 'video/mp4; codecs="avc1.640028"',
            'x-youtube-client-version': '2.20260408.01.00',
            'range': `bytes=0-${payload.length - 1}/${payload.length}`,
            'cache-control': 'no-cache, no-store',
            'server': 'gvis',
          },
          ja4Fingerprint: JA4_FINGERPRINTS.CHROME_DESKTOP,
          payloadBase64,
          timestamp,
        };

      case 'sharepoint-sync':
        return {
          profile,
          headers: {
            'content-type': 'application/octet-stream',
            'x-ms-request-id': `sp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
            'x-sharepoint-version': '16.0.17425.20144',
            'x-office365-tenant': 'enterprise-shared-sync',
          },
          ja4Fingerprint: JA4_FINGERPRINTS.CHROME_DESKTOP,
          payloadBase64,
          timestamp,
        };

      case 'zoom-https':
        return {
          profile,
          headers: {
            'content-type': 'application/x-zoom-media',
            'x-zm-tracking-id': `zm-${Date.now()}`,
            'x-zoom-client-type': 'web-v5',
          },
          ja4Fingerprint: JA4_FINGERPRINTS.SAFARI_APPLE,
          payloadBase64,
          timestamp,
        };
    }
  }

  /**
   * Unwraps a camouflaged envelope to extract the raw encrypted media/signaling bytes.
   */
  public static unwrap(envelope: CamouflagedEnvelope): Uint8Array {
    if (!envelope || !envelope.payloadBase64) {
      throw new Error('Invalid camouflaged envelope: payload missing');
    }
    return base64ToUint8(envelope.payloadBase64);
  }
}
