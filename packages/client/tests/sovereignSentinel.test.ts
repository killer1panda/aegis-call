import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { SovereignSentinelModal } from '../src/components/SovereignSentinelModal.js';
import {
  EnclaveKeyManager,
  createDeviceAttestation,
  verifyDeviceAttestation,
  ProtocolCamouflage,
  UltrasonicModem,
  ZKMembershipEngine,
  QuorumCallArchive,
} from '@aegis/crypto';
import { MobileScreenSecurityService } from '@aegis/mobile';
import { ScreenShareSentinel } from '../src/services/screenShareSentinel.js';
import { SpatialMicroFlicker } from '../src/services/spatialSteganography.js';
import { ChromaticSignalingTransceiver } from '../src/services/chromaticSignaling.js';

describe('AegisCall Sovereign Sentinel & Anti-Surveillance Suite Component & Flow Integration', () => {
  it('should export SovereignSentinelModal component successfully', () => {
    expect(SovereignSentinelModal).toBeDefined();
    expect(typeof SovereignSentinelModal).toBe('function');
  });

  it('Pillar 1: Hardware Enclave & Remote Attestation integration behaves correctly', () => {
    // 1. Hardware Enclave Keypair Generation
    const enclaveKeys = EnclaveKeyManager.generateEnclaveKeyPair('apple-sep');
    expect(enclaveKeys.enclaveType).toBe('apple-sep');
    expect(enclaveKeys.hardwareBacked).toBe(true);
    expect(enclaveKeys.publicKeyHex).toHaveLength(64);

    // 2. Remote Device Attestation Handshake
    const dummySigner = new Uint8Array(32);
    dummySigner.fill(0x09);
    const nonce = 'session-nonce-12345';
    const proof = createDeviceAttestation(
      {
        deviceId: 'did:aegis:test-peer',
        nonce,
        platform: 'macos',
        bootloaderLocked: true,
        debuggerAttached: false,
        integrityPassed: true,
        appBuildHash: 'sha256-aegis-reproducible-v1.0.0',
      },
      dummySigner
    );

    const verified = verifyDeviceAttestation(proof, nonce);
    expect(verified.valid).toBe(true);

    // 3. Screen Shield Toggle
    expect(MobileScreenSecurityService.setScreenShield(true)).toBe(true);
    expect(MobileScreenSecurityService.isShieldEnabled()).toBe(true);
    expect(MobileScreenSecurityService.setScreenShield(false)).toBe(false);
  });

  it('Pillar 2: Extreme Traffic Camouflage & Protocol Mimicry behaves correctly', () => {
    const rawPayload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const youtubeEnvelope = ProtocolCamouflage.wrap(rawPayload, 'youtube-stream');
    expect(youtubeEnvelope.profile).toBe('youtube-stream');
    expect(youtubeEnvelope.headers['content-type']).toContain('video/mp4');
    expect(youtubeEnvelope.ja4Fingerprint).toContain('t13d1516h2_');

    const sharepointEnvelope = ProtocolCamouflage.wrap(rawPayload, 'sharepoint-sync');
    expect(sharepointEnvelope.headers['x-office365-tenant']).toBe('enterprise-shared-sync');
  });

  it('Pillar 3: Acoustic & Optical Air-Gap Signaling behaves correctly', () => {
    const acousticPayload = new Uint8Array([0x41, 0x45, 0x47, 0x49, 0x53]); // "AEGIS"
    const audioSamples = UltrasonicModem.modulate(acousticPayload);
    expect(audioSamples.length).toBeGreaterThan(0);

    const testBinary = new Uint8Array([0xfe, 0xdc, 0xba, 0x98]);
    const colorGrid = ChromaticSignalingTransceiver.encodeToGrid(testBinary, 8);
    expect(colorGrid.length).toBe(8);
    expect(colorGrid[0].length).toBe(8);

    const decoded = ChromaticSignalingTransceiver.decodeFromGrid(colorGrid, testBinary.length);
    expect(decoded).toEqual(testBinary);
  });

  it('Pillar 4: ZK Group Membership & M-of-N Quorum Archives behaves correctly', async () => {
    // 1. ZK Membership
    const sk1 = ed25519.utils.randomPrivateKey();
    const pk1 = ed25519.getPublicKey(sk1);
    const sk2 = ed25519.utils.randomPrivateKey();
    const pk2 = ed25519.getPublicKey(sk2);
    const memberList = [pk1, pk2];
    const tree = ZKMembershipEngine.buildMerkleTree(memberList);

    const proof = ZKMembershipEngine.generateMembershipProof(0, sk1, memberList, 'room-test', 1);
    const verified = ZKMembershipEngine.verifyMembershipProof(proof, tree.rootHex, 'room-test', memberList);
    expect(verified.valid).toBe(true);

    // 2. M-of-N Quorum Decryption
    const recordingData = new TextEncoder().encode('High-level executive board transcript');
    const { archive, shares } = await QuorumCallArchive.encryptArchive(recordingData, 'room-test', 3, 5);
    expect(shares.length).toBe(5);

    const decrypted = await QuorumCallArchive.decryptArchive(archive, shares.slice(0, 3));
    expect(new TextDecoder().decode(decrypted)).toBe('High-level executive board transcript');

    await expect(
      QuorumCallArchive.decryptArchive(archive, shares.slice(0, 2))
    ).rejects.toThrow('Insufficient quorum');
  });

  it('Pillar 5: Local Edge AI Screen-Share Sentinel & Steganography behaves correctly', () => {
    const sentinel = ScreenShareSentinel.getInstance();
    const testSecret = 'Deployment key: AKIAIOSFODNN7EXAMPLE for AWS cloud';
    const detected = sentinel.scanText(testSecret);
    expect(detected.length).toBe(1);
    expect(detected[0].patternType).toBe('aws-key');
    expect(detected[0].redactedSnippet).toContain('••••••••');
  });
});
