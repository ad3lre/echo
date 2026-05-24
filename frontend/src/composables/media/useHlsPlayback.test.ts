/** @vitest-environment happy-dom */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick, createApp, defineComponent, type Ref } from 'vue';
import { useHlsPlayback } from './useHlsPlayback';
import type { ChatVideoPlaybackState } from '@/composables/useChatVideoPlayback';

const mockDestroy = vi.fn();
const mockLoadSource = vi.fn();
const mockAttachMedia = vi.fn();
const mockOn = vi.fn();

vi.mock('hls.js', () => ({
  default: class MockHls {
    static isSupported = () => true;
    static Events = { ERROR: 'hlsError' };
    destroy = mockDestroy;
    loadSource = mockLoadSource;
    attachMedia = mockAttachMedia;
    on = mockOn;
  },
}));

describe('useHlsPlayback', () => {
  let unmount: (() => void) | undefined;

  beforeEach(() => {
    mockDestroy.mockClear();
    mockLoadSource.mockClear();
    mockAttachMedia.mockClear();
    mockOn.mockClear();
  });

  afterEach(() => {
    unmount?.();
    unmount = undefined;
  });

  function mountHls(
    videoRef: Ref<HTMLVideoElement | null>,
    playbackState: Ref<ChatVideoPlaybackState>,
    progressiveSrc: Ref<string | undefined>,
  ): void {
    const app = createApp(
      defineComponent({
        setup() {
          useHlsPlayback(videoRef, playbackState, { progressiveSrc });
          return () => null;
        },
      }),
    );
    app.mount(document.createElement('div'));
    unmount = () => app.unmount();
  }

  it('sets progressive src when not in hls ready mode', async () => {
    const videoRef = ref<HTMLVideoElement | null>(null);
    const el = document.createElement('video');
    videoRef.value = el;

    const playbackState = ref<ChatVideoPlaybackState>({
      status: 'pending',
      mode: 'progressive',
      playbackUrl: 'https://example.com/a.mp4',
      sourceUrl: 'https://example.com/a.mp4',
      sourceEtag: null,
      sourceSize: 0,
    });

    mountHls(videoRef, playbackState, ref('https://example.com/a.mp4'));
    await nextTick();
    expect(el.src).toContain('a.mp4');
    expect(mockLoadSource).not.toHaveBeenCalled();
  });

  it('attaches hls.js when hls ready and browser lacks native HLS', async () => {
    const videoRef = ref<HTMLVideoElement | null>(null);
    const el = document.createElement('video');
    vi.spyOn(el, 'canPlayType').mockReturnValue('');
    videoRef.value = el;

    const playbackState = ref<ChatVideoPlaybackState>({
      status: 'ready',
      mode: 'hls',
      playbackUrl: 'https://example.com/master.m3u8',
      sourceUrl: 'https://example.com/a.mp4',
      sourceEtag: 'x',
      sourceSize: 1,
    });

    mountHls(videoRef, playbackState, ref(undefined));
    await nextTick();
    await vi.waitFor(() => expect(mockLoadSource).toHaveBeenCalled());
    expect(mockLoadSource).toHaveBeenCalledWith(
      'https://example.com/master.m3u8',
    );
    expect(mockAttachMedia).toHaveBeenCalledWith(el);
  });
});
