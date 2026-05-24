import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, ref } from 'vue';
import { useChatVideoPlayback } from './useChatVideoPlayback';

vi.mock('@/api/echo/uploads', () => ({
  fetchEchoVideoPlayback: vi.fn(),
}));

import { fetchEchoVideoPlayback } from '@/api/echo/uploads';

const pendingResponse = {
  status: 'pending' as const,
  format: 'progressive' as const,
  sourceUrl: 'https://example.com/clip.mp4',
  sourceEtag: null,
  sourceSize: 500,
};

const readyResponse = {
  status: 'ready' as const,
  format: 'hls' as const,
  playbackUrl:
    'https://example.com/api/v1/echo/uploads/s3/echo/ch/h/u/clip/hls/master.m3u8',
  sourceUrl: 'https://example.com/api/v1/echo/uploads/s3/echo/ch/h/u/clip.mp4',
  sourceEtag: 'abc',
  sourceSize: 1000,
};

function runInScope<T>(fn: () => T): T {
  const scope = effectScope();
  return scope.run(fn)!;
}

describe('useChatVideoPlayback', () => {
  beforeEach(() => {
    vi.mocked(fetchEchoVideoPlayback).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses url= API and selects HLS when ready', async () => {
    vi.mocked(fetchEchoVideoPlayback).mockResolvedValue(readyResponse);
    const url = ref(
      'https://example.com/api/v1/echo/uploads/s3/echo/ch/h/u/clip.mp4',
    );
    const { state } = runInScope(() => useChatVideoPlayback(url));
    await vi.waitFor(() => expect(state.value.status).toBe('ready'));
    expect(fetchEchoVideoPlayback).toHaveBeenCalledWith(null, url.value);
    expect(state.value.mode).toBe('hls');
    expect(state.value.sourceUrl).toContain('clip.mp4');
  });

  it('falls back to progressive while pending', async () => {
    vi.mocked(fetchEchoVideoPlayback).mockResolvedValue(pendingResponse);
    const url = ref('https://example.com/clip.mp4');
    const { state } = runInScope(() => useChatVideoPlayback(url));
    await vi.waitFor(() => expect(state.value.status).toBe('pending'));
    expect(state.value.mode).toBe('progressive');
  });

  it('polls until ready and then stops', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.mocked(fetchEchoVideoPlayback).mockImplementation(async () => {
      calls += 1;
      return calls === 1 ? pendingResponse : readyResponse;
    });
    const url = ref('https://example.com/clip.mp4');
    const { state } = runInScope(() =>
      useChatVideoPlayback(url, { pollMs: 4000 }),
    );
    await vi.waitFor(() => expect(state.value.status).toBe('pending'));
    expect(calls).toBe(1);

    await vi.advanceTimersByTimeAsync(4000);
    await vi.waitFor(() => expect(state.value.status).toBe('ready'));
    expect(state.value.mode).toBe('hls');
    expect(calls).toBe(2);

    await vi.advanceTimersByTimeAsync(12000);
    expect(calls).toBe(2);
  });

  it('stops polling after failed status', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.mocked(fetchEchoVideoPlayback).mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return pendingResponse;
      return {
        status: 'failed' as const,
        format: 'progressive' as const,
        sourceUrl: 'https://example.com/clip.mp4',
        sourceEtag: null,
        sourceSize: 500,
      };
    });
    const url = ref('https://example.com/clip.mp4');
    const { state } = runInScope(() =>
      useChatVideoPlayback(url, { pollMs: 4000 }),
    );
    await vi.waitFor(() => expect(state.value.status).toBe('pending'));

    await vi.advanceTimersByTimeAsync(4000);
    await vi.waitFor(() => expect(state.value.status).toBe('failed'));
    expect(calls).toBe(2);

    await vi.advanceTimersByTimeAsync(12000);
    expect(calls).toBe(2);
  });

  it('silent poll refresh does not flip to loading', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchEchoVideoPlayback).mockResolvedValue(pendingResponse);
    const url = ref('https://example.com/clip.mp4');
    const { state } = runInScope(() =>
      useChatVideoPlayback(url, { pollMs: 4000 }),
    );
    await vi.waitFor(() => expect(state.value.status).toBe('pending'));

    await vi.advanceTimersByTimeAsync(4000);
    await vi.waitFor(() =>
      expect(fetchEchoVideoPlayback).toHaveBeenCalledTimes(2),
    );
    expect(state.value.status).toBe('pending');
  });
});
