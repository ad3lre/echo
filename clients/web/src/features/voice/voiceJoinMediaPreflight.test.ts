import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertVoiceJoinMediaReady } from '@/features/voice/voiceJoinMediaPreflight';

function fakeTrack(): MediaStreamTrack {
  return {
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
}

function fakeStream(): MediaStream {
  return {
    getTracks: () => [fakeTrack()],
  } as unknown as MediaStream;
}

describe('assertVoiceJoinMediaReady', () => {
  const originalMd = navigator.mediaDevices;

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMd,
    });
    vi.useRealTimers();
  });

  it('succeeds when getUserMedia works even if enumerateDevices lists no audioinput', async () => {
    const getUserMedia = vi.fn(async () => fakeStream());
    const enumerateDevices = vi.fn(async () => [] as MediaDeviceInfo[]);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia, enumerateDevices },
    });

    await expect(assertVoiceJoinMediaReady()).resolves.toBeUndefined();
    expect(getUserMedia).toHaveBeenCalled();
    expect(enumerateDevices).toHaveBeenCalled();
  });

  it('still fails when speakers are expected but none are listed', async () => {
    const getUserMedia = vi.fn(async () => fakeStream());
    const enumerateDevices = vi.fn(
      async () =>
        [
          {
            kind: 'audioinput',
            deviceId: 'mic-1',
            label: 'Mic',
            groupId: '',
            toJSON: () => ({}),
          },
          {
            kind: 'audiooutput',
            deviceId: '',
            label: '',
            groupId: '',
            toJSON: () => ({}),
          },
        ] as MediaDeviceInfo[],
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia, enumerateDevices },
    });

    await expect(assertVoiceJoinMediaReady()).rejects.toThrow(
      /speaker or headphone/i,
    );
  });
});
