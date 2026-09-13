import { describe, it, expect, vi } from 'vitest';
import { ScreenShareSentinel } from '../src/services/screenShareSentinel.js';

describe('AegisCall Autonomous Screen-Share Data Leak Sentinel', () => {
  it('should maintain singleton instance', () => {
    const s1 = ScreenShareSentinel.getInstance();
    const s2 = ScreenShareSentinel.getInstance();
    expect(s1).toBe(s2);
    expect(s1).toBeInstanceOf(ScreenShareSentinel);
  });

  it('should intercept accidental AWS access key leaks in OCR text', () => {
    const sentinel = ScreenShareSentinel.getInstance();
    const leakedTerminalOutput = `
      export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
      export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
    `;

    const secrets = sentinel.scanText(leakedTerminalOutput);
    expect(secrets.length).toBeGreaterThanOrEqual(1);

    const awsLeak = secrets.find((s) => s.patternType === 'aws-key');
    expect(awsLeak).toBeDefined();
    expect(awsLeak?.matchedText).toBe('AKIAIOSFODNN7EXAMPLE');
    expect(awsLeak?.redactedSnippet).toContain('••••••••');
  });

  it('should intercept accidental RSA / SSH private key header exposures', () => {
    const sentinel = ScreenShareSentinel.getInstance();
    const leakedKeyFile = `
      -----BEGIN RSA PRIVATE KEY-----
      MIIEowIBAAKCAQEA0Y3t4eX4123456789...
    `;

    const secrets = sentinel.scanText(leakedKeyFile);
    const keyLeak = secrets.find((s) => s.patternType === 'private-key');
    expect(keyLeak).toBeDefined();
    expect(keyLeak?.matchedText).toBe('-----BEGIN RSA PRIVATE KEY-----');
  });

  it('should intercept accidental GitHub personal access tokens', () => {
    const sentinel = ScreenShareSentinel.getInstance();
    const leakedCode = `const GITHUB_TOKEN = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';`;

    const secrets = sentinel.scanText(leakedCode);
    const ghLeak = secrets.find((s) => s.patternType === 'github-token');
    expect(ghLeak).toBeDefined();
    expect(ghLeak?.matchedText).toBe('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');
  });

  it('should draw blackout redaction rectangles over canvas coordinates', () => {
    const sentinel = ScreenShareSentinel.getInstance();
    const saveMock = vi.fn();
    const fillRectMock = vi.fn();
    const strokeRectMock = vi.fn();
    const restoreMock = vi.fn();

    const mockCtx = {
      save: saveMock,
      fillRect: fillRectMock,
      strokeRect: strokeRectMock,
      restore: restoreMock,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
    } as unknown as CanvasRenderingContext2D;

    sentinel.redactCanvas(mockCtx, [{ x: 100, y: 200, width: 300, height: 40 }]);

    expect(saveMock).toHaveBeenCalled();
    expect(fillRectMock).toHaveBeenCalledWith(100, 200, 300, 40);
    expect(strokeRectMock).toHaveBeenCalledWith(100, 200, 300, 40);
    expect(restoreMock).toHaveBeenCalled();
  });

  it('should initialize and execute active video frame sanitizer pipeline', () => {
    const sentinel = ScreenShareSentinel.getInstance();

    const dummyTrack = {
      kind: 'video',
      id: 'mock-screen-track-1',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;

    const detectedSecretsList: any[] = [];
    let frameSampleCount = 0;

    const handle = sentinel.createSanitizedTrack(dummyTrack, {
      fps: 30,
      width: 1280,
      height: 720,
      onSecretDetected: (secrets) => {
        detectedSecretsList.push(...secrets);
      },
      ocrSampler: () => {
        frameSampleCount++;
        return 'AWS_SECRET_KEY=AKIAIOSFODNN7EXAMPLE in terminal buffer';
      },
    });

    expect(handle).toBeDefined();
    expect(handle.sanitizedTrack).toBeDefined();
    expect(typeof handle.stop).toBe('function');
    expect(typeof handle.getProcessedFrameCount).toBe('function');

    // Tear down
    handle.stop();
  });
});
