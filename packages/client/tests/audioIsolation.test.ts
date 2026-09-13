import { describe, it, expect } from 'vitest';
import { AudioIsolationService } from '../src/services/audioIsolationService.js';

describe('AegisCall Audio-Isolated Application Window Sharing Service', () => {
  it('should maintain singleton instance', () => {
    const service1 = AudioIsolationService.getInstance();
    const service2 = AudioIsolationService.getInstance();
    expect(service1).toBe(service2);
    expect(service1).toBeInstanceOf(AudioIsolationService);
  });

  it('should correctly identify Tauri desktop vs web environment', () => {
    const service = AudioIsolationService.getInstance();
    expect(service.isTauriDesktop()).toBe(false);
  });

  it('should enumerate isolated window presentation streams with browser fallback', async () => {
    const service = AudioIsolationService.getInstance();
    const windows = await service.getAvailableIsolatedWindows();

    expect(Array.isArray(windows)).toBe(true);
    expect(windows.length).toBeGreaterThanOrEqual(2);

    expect(windows[0]).toEqual({
      id: 1,
      title: 'Active Presentation / Document',
      process_name: 'presentation',
      is_isolated: true,
    });
    expect(windows[1]).toEqual({
      id: 2,
      title: 'Code Editor / IDE Workspace',
      process_name: 'editor',
      is_isolated: true,
    });
  });

  it('should gracefully handle empty or invalid streams without audio tracks', () => {
    const service = AudioIsolationService.getInstance();
    const emptyStream = {
      getAudioTracks: () => [],
    } as unknown as MediaStream;

    const isolatedTrack = service.createIsolatedAudioTrack(emptyStream);
    expect(isolatedTrack).toBeNull();
  });

  it('should gracefully dispose audio context resources', () => {
    const service = AudioIsolationService.getInstance();
    expect(() => service.dispose()).not.toThrow();
  });
});
