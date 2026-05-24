/** @vitest-environment happy-dom */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { ref, nextTick, createApp, defineComponent } from 'vue';
import { useMediaElementPlayback } from './useMediaElementPlayback';

function mountComposable(setupFn: () => void): () => void {
  const app = createApp(
    defineComponent({
      setup() {
        setupFn();
        return () => null;
      },
    }),
  );
  const el = document.createElement('div');
  app.mount(el);
  return () => app.unmount();
}

function createMockMedia(): HTMLMediaElement {
  let paused = true;
  let currentTime = 0;
  const listeners = new Map<string, Set<() => void>>();
  const el = {
    ended: false,
    duration: 120,
    volume: 1,
    muted: false,
    readyState: 4,
    buffered: {
      length: 1,
      start: () => 0,
      end: () => 60,
    },
    play: vi.fn(async () => {
      paused = false;
      listeners.get('play')?.forEach((fn) => fn());
    }),
    pause: vi.fn(() => {
      paused = true;
      listeners.get('pause')?.forEach((fn) => fn());
    }),
    addEventListener: (ev: string, fn: () => void) => {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev)!.add(fn);
    },
    removeEventListener: (ev: string, fn: () => void) => {
      listeners.get(ev)?.delete(fn);
    },
  } as unknown as HTMLMediaElement;
  Object.defineProperty(el, 'paused', {
    get: () => paused,
    configurable: true,
  });
  Object.defineProperty(el, 'currentTime', {
    get: () => currentTime,
    set: (v: number) => {
      currentTime = v;
      listeners.get('timeupdate')?.forEach((fn) => fn());
    },
    configurable: true,
  });
  return el;
}

describe('useMediaElementPlayback', () => {
  let unmount: (() => void) | undefined;

  afterEach(() => {
    unmount?.();
    unmount = undefined;
  });

  it('syncs play state and toggles playback', async () => {
    const mediaRef = ref<HTMLMediaElement | null>(null);
    let api!: ReturnType<typeof useMediaElementPlayback>;
    unmount = mountComposable(() => {
      api = useMediaElementPlayback(mediaRef);
    });
    const el = createMockMedia();
    mediaRef.value = el;
    await nextTick();
    expect(api.isPlaying.value).toBe(false);
    expect(api.duration.value).toBe(120);
    api.togglePlay();
    await nextTick();
    expect(el.play).toHaveBeenCalled();
    expect(api.isPlaying.value).toBe(true);
    api.togglePlay();
    expect(el.pause).toHaveBeenCalled();
  });

  it('sets playback rate on element', async () => {
    const mediaRef = ref<HTMLMediaElement | null>(null);
    let api!: ReturnType<typeof useMediaElementPlayback>;
    unmount = mountComposable(() => {
      api = useMediaElementPlayback(mediaRef);
    });
    const el = createMockMedia();
    Object.defineProperty(el, 'playbackRate', {
      value: 1,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(el, 'defaultPlaybackRate', {
      value: 1,
      writable: true,
      configurable: true,
    });
    mediaRef.value = el;
    await nextTick();
    api.setPlaybackRate(1.5);
    expect(el.playbackRate).toBe(1.5);
    expect(api.playbackRate.value).toBe(1.5);
  });

  it('seeks within duration bounds', async () => {
    const mediaRef = ref<HTMLMediaElement | null>(null);
    let api!: ReturnType<typeof useMediaElementPlayback>;
    unmount = mountComposable(() => {
      api = useMediaElementPlayback(mediaRef);
    });
    const el = createMockMedia();
    mediaRef.value = el;
    await nextTick();
    api.seek(30);
    expect(api.currentTime.value).toBe(30);
    api.seek(999);
    expect(api.currentTime.value).toBe(120);
  });
});
