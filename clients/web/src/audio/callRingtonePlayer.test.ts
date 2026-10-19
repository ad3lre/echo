import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const applyOutputSinkMock = vi.fn(
  async (..._args: unknown[]): Promise<void> => undefined,
);
const playNativeMock = vi.fn(
  async (..._args: unknown[]): Promise<void> => undefined,
);
const stopNativeMock = vi.fn(
  async (..._args: unknown[]): Promise<void> => undefined,
);
const setNativeVolumeMock = vi.fn(
  async (..._args: unknown[]): Promise<void> => undefined,
);
const initNativeMock = vi.fn(
  async (..._args: unknown[]): Promise<void> => undefined,
);
let desktopEnabled = false;
let isDesktopValue = false;

vi.mock('@/audio/applyOutputSink', () => ({
  applyOutputSink: (el: HTMLMediaElement) => applyOutputSinkMock(el),
}));

vi.mock('@/config', () => ({
  get DESKTOP_NATIVE_AUDIO_ENABLED() {
    return desktopEnabled;
  },
}));

vi.mock('@/platform/desktopBridge', () => ({
  isDesktop: () => isDesktopValue,
  initDesktopNativeAudio: (...args: unknown[]) => initNativeMock(...args),
  playDesktopNativeRingtone: (...args: unknown[]) => playNativeMock(...args),
  stopDesktopNativeRingtone: (...args: unknown[]) => stopNativeMock(...args),
  setDesktopNativeRingtoneVolume: (...args: unknown[]) =>
    setNativeVolumeMock(...args),
}));

vi.mock('@/audio/audioPlaybackUnlock', () => ({
  isAudioPlaybackBlockedError: () => false,
  isAudioPlaybackUnlocked: () => true,
  whenAudioPlaybackUnlocked: () => () => undefined,
}));

vi.mock('@/audio/callRingtoneAssets', () => ({
  CALL_RINGTONE_PLAYBACK_FALLBACK_URL: '',
}));

type FakeAudio = HTMLAudioElement & {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  setAttribute: ReturnType<typeof vi.fn>;
  canPlayType: ReturnType<typeof vi.fn>;
  errorHandlers: Array<() => void>;
};

function makeFakeAudio(url = ''): FakeAudio {
  const errorHandlers: Array<() => void> = [];
  const el = {
    src: url,
    loop: false,
    preload: '',
    volume: 1,
    paused: true,
    errorHandlers,
    canPlayType: vi.fn(() => ''),
    play: vi.fn(async () => {
      el.paused = false;
    }),
    pause: vi.fn(() => {
      el.paused = true;
    }),
    load: vi.fn(),
    removeAttribute: vi.fn(),
    addEventListener: vi.fn((type: string, handler: () => void) => {
      if (type === 'error') errorHandlers.push(handler);
    }),
    setAttribute: vi.fn(),
  };
  return el as unknown as FakeAudio;
}

describe('syncCallRingtoneLoop', () => {
  let created: FakeAudio[];

  beforeEach(async () => {
    created = [];
    desktopEnabled = false;
    isDesktopValue = false;
    applyOutputSinkMock.mockClear();
    playNativeMock.mockClear();
    stopNativeMock.mockClear();
    setNativeVolumeMock.mockClear();
    initNativeMock.mockClear();
    vi.stubGlobal(
      'Audio',
      vi.fn(function Audio(this: FakeAudio, url?: string) {
        const el = makeFakeAudio(url ?? '');
        if (url) created.push(el);
        Object.assign(this, el);
        return el;
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4),
      })),
    );
    vi.resetModules();
    const { stopCallRingtone } = await import('@/audio/callRingtonePlayer');
    stopCallRingtone();
  });

  afterEach(async () => {
    const { stopCallRingtone } = await import('@/audio/callRingtonePlayer');
    stopCallRingtone();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('does not recreate or re-play when only volume changes', async () => {
    const { syncCallRingtoneLoop } = await import('@/audio/callRingtonePlayer');
    const url = 'https://example.test/ring.mp3';

    syncCallRingtoneLoop(true, url, 0.5);
    expect(created).toHaveLength(1);
    expect(created[0]?.play).toHaveBeenCalledTimes(1);
    expect(created[0]?.volume).toBe(0.5);
    expect(applyOutputSinkMock).toHaveBeenCalledTimes(1);

    syncCallRingtoneLoop(true, url, 0.2);
    expect(created).toHaveLength(1);
    expect(created[0]?.play).toHaveBeenCalledTimes(1);
    expect(created[0]?.volume).toBe(0.2);
    expect(applyOutputSinkMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the element when volume hits zero instead of tearing down', async () => {
    const { syncCallRingtoneLoop } = await import('@/audio/callRingtonePlayer');
    const url = 'https://example.test/ring.mp3';

    syncCallRingtoneLoop(true, url, 0.4);
    syncCallRingtoneLoop(true, url, 0);
    expect(created).toHaveLength(1);
    expect(created[0]?.volume).toBe(0);
    expect(created[0]?.paused).toBe(false);

    syncCallRingtoneLoop(true, url, 0.6);
    expect(created).toHaveLength(1);
    expect(created[0]?.play).toHaveBeenCalledTimes(1);
    expect(created[0]?.volume).toBe(0.6);
  });

  it('starts a new element when the ringtone URL changes', async () => {
    const { syncCallRingtoneLoop } = await import('@/audio/callRingtonePlayer');

    syncCallRingtoneLoop(true, 'https://example.test/a.mp3', 0.5);
    syncCallRingtoneLoop(true, 'https://example.test/b.mp3', 0.5);

    expect(created.length).toBeGreaterThanOrEqual(2);
    expect(created.at(-1)?.play).toHaveBeenCalledTimes(1);
  });

  it('ignores error events from a superseded browser element', async () => {
    const { syncCallRingtoneLoop } = await import('@/audio/callRingtonePlayer');

    syncCallRingtoneLoop(true, 'https://example.test/a.mp3', 0.5);
    const first = created[0]!;
    syncCallRingtoneLoop(true, 'https://example.test/b.mp3', 0.5);
    const second = created[1]!;

    first.errorHandlers.forEach((h) => h());
    expect(second.paused).toBe(false);
    expect(created.at(-1)).toBe(second);
  });

  it('clamps non-finite volume to zero without tearing down', async () => {
    const { syncCallRingtoneLoop } = await import('@/audio/callRingtonePlayer');
    const url = 'https://example.test/ring.mp3';

    syncCallRingtoneLoop(true, url, 0.5);
    syncCallRingtoneLoop(true, url, Number.NaN);
    expect(created).toHaveLength(1);
    expect(created[0]?.volume).toBe(0);
    expect(created[0]?.paused).toBe(false);
  });

  it('updates native volume without replaying', async () => {
    desktopEnabled = true;
    isDesktopValue = true;
    vi.resetModules();
    const { syncCallRingtoneLoop, stopCallRingtone } =
      await import('@/audio/callRingtonePlayer');
    stopCallRingtone();

    const url = 'https://example.test/native.mp3';
    syncCallRingtoneLoop(true, url, 0.8);
    await vi.waitFor(() => expect(playNativeMock).toHaveBeenCalledTimes(1));

    syncCallRingtoneLoop(true, url, 0.2);
    await vi.waitFor(() =>
      expect(setNativeVolumeMock).toHaveBeenCalledWith(0.2),
    );
    expect(playNativeMock).toHaveBeenCalledTimes(1);
  });

  it('does not start native playback after stop during init', async () => {
    desktopEnabled = true;
    isDesktopValue = true;
    let resolveInit: (() => void) | undefined;
    initNativeMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveInit = resolve;
        }),
    );
    vi.resetModules();
    const { syncCallRingtoneLoop, stopCallRingtone } =
      await import('@/audio/callRingtonePlayer');
    stopCallRingtone();

    syncCallRingtoneLoop(true, 'https://example.test/late.mp3', 0.5);
    stopCallRingtone();
    resolveInit?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(playNativeMock).not.toHaveBeenCalled();
  });
});
