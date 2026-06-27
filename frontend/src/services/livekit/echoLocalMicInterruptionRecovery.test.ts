import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachEchoLocalMicInterruptionRecovery,
  type RecoverableLocalMicTrack,
} from './echoLocalMicInterruptionRecovery';

const mockDispatchAppToastDetail = vi.fn();
const mockIsSafariLikeBrowser = vi.fn<() => boolean>(() => false);
const mockIsIosLikeBrowser = vi.fn<() => boolean>(() => false);

vi.mock('@/utils/controllerMissingAction', () => ({
  dispatchAppToastDetail: (...args: unknown[]) =>
    mockDispatchAppToastDetail(...args),
}));

vi.mock('@/platform/browserCompatibility', () => ({
  isSafariLikeBrowser: () => mockIsSafariLikeBrowser(),
  isIosLikeBrowser: () => mockIsIosLikeBrowser(),
}));

vi.mock('@/observability/voiceClientTrace', () => ({
  voiceClientDiag: vi.fn(),
}));

/**
 * Minimal stand-in for a capture `MediaStreamTrack`: settable `muted`/`readyState`
 * plus the `onmute`/`onunmute`/`onended` handler slots the module binds to.
 */
class FakeMediaStreamTrack {
  muted = false;
  readyState: 'live' | 'ended' = 'live';
  onmute: (() => void) | null = null;
  onunmute: (() => void) | null = null;
  onended: (() => void) | null = null;

  /** Hardware interruption (Safari): `muted` flips true, NOT a user mute. */
  emitMute(): void {
    this.muted = true;
    this.onmute?.();
  }

  emitUnmute(): void {
    this.muted = false;
    this.onunmute?.();
  }

  emitEnded(): void {
    this.readyState = 'ended';
    this.onended?.();
  }
}

interface StubLocalMicTrack {
  mediaStreamTrack: FakeMediaStreamTrack;
  restartTrack: ReturnType<typeof vi.fn>;
}

/**
 * Stub `LocalAudioTrack` slice. `restartTrack` swaps in a fresh capture track to
 * mirror LiveKit re-acquiring the device, unless `fail` is set (rejects instead).
 */
function makeStubTrack(opts: { fail?: boolean } = {}): StubLocalMicTrack {
  const stub: StubLocalMicTrack = {
    mediaStreamTrack: new FakeMediaStreamTrack(),
    restartTrack: vi.fn(async () => {
      if (opts.fail) throw new Error('NotReadableError: device busy');
      stub.mediaStreamTrack = new FakeMediaStreamTrack();
    }),
  };
  return stub;
}

/** Let queued microtasks (awaited `restartTrack`) settle without advancing time. */
async function flushMicrotasks(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe('attachEchoLocalMicInterruptionRecovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockDispatchAppToastDetail.mockReset();
    mockIsSafariLikeBrowser.mockReturnValue(false);
    mockIsIosLikeBrowser.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('restarts the track on `ended` and re-binds listeners to the new capture track', async () => {
    const track = makeStubTrack();
    const firstTrack = track.mediaStreamTrack;

    const detach = attachEchoLocalMicInterruptionRecovery(
      track as unknown as RecoverableLocalMicTrack,
      {
        shouldAutoRecover: () => true,
      },
    );

    firstTrack.emitEnded();
    await flushMicrotasks();

    expect(track.restartTrack).toHaveBeenCalledTimes(1);
    // The original (dead) track is unbound, the freshly acquired one is bound.
    expect(firstTrack.onended).toBeNull();
    expect(track.mediaStreamTrack).not.toBe(firstTrack);
    expect(track.mediaStreamTrack.onended).toBeInstanceOf(Function);

    // A second interruption on the *new* track recovers again, proving the re-bind.
    track.mediaStreamTrack.emitEnded();
    await flushMicrotasks();
    expect(track.restartTrack).toHaveBeenCalledTimes(2);

    detach();
  });

  it('passes captureOptions into restartTrack', async () => {
    const track = makeStubTrack();
    const captureOptions = { deviceId: 'mic-42' };

    const detach = attachEchoLocalMicInterruptionRecovery(
      track as unknown as RecoverableLocalMicTrack,
      {
        shouldAutoRecover: () => true,
        captureOptions: () => captureOptions,
      },
    );

    track.mediaStreamTrack.emitEnded();
    await flushMicrotasks();

    expect(track.restartTrack).toHaveBeenCalledWith(captureOptions);
    detach();
  });

  it('recovers when the mute watchdog fires and the track is still muted', async () => {
    const track = makeStubTrack();
    const onRecovered = vi.fn();

    const detach = attachEchoLocalMicInterruptionRecovery(
      track as unknown as RecoverableLocalMicTrack,
      {
        shouldAutoRecover: () => true,
        onRecovered,
      },
    );

    track.mediaStreamTrack.emitMute();

    // Nothing before the grace window elapses.
    await vi.advanceTimersByTimeAsync(2499);
    expect(track.restartTrack).not.toHaveBeenCalled();

    // Watchdog (2500ms) trips with the track still hardware-muted.
    await vi.advanceTimersByTimeAsync(1);
    expect(track.restartTrack).toHaveBeenCalledTimes(1);
    expect(onRecovered).toHaveBeenCalledTimes(1);

    detach();
  });

  it('does not recover if the track unmutes before the watchdog fires', async () => {
    const track = makeStubTrack();

    const detach = attachEchoLocalMicInterruptionRecovery(
      track as unknown as RecoverableLocalMicTrack,
      {
        shouldAutoRecover: () => true,
      },
    );

    const mst = track.mediaStreamTrack;
    mst.emitMute();
    await vi.advanceTimersByTimeAsync(1000);
    mst.emitUnmute();

    await vi.advanceTimersByTimeAsync(5000);
    expect(track.restartTrack).not.toHaveBeenCalled();

    detach();
  });

  it('on unmute clears timers, resets attempts, and calls onRecovered', async () => {
    const track = makeStubTrack();
    const onRecovered = vi.fn();

    const detach = attachEchoLocalMicInterruptionRecovery(
      track as unknown as RecoverableLocalMicTrack,
      {
        shouldAutoRecover: () => true,
        onRecovered,
      },
    );

    const mst = track.mediaStreamTrack;
    mst.emitMute();
    mst.emitUnmute();

    expect(onRecovered).toHaveBeenCalledTimes(1);

    // Timers were cleared, so the watchdog never fires.
    await vi.advanceTimersByTimeAsync(5000);
    expect(track.restartTrack).not.toHaveBeenCalled();

    detach();
  });

  it('stops retrying and dispatches a toast after MAX_RECOVERY_ATTEMPTS failures', async () => {
    const track = makeStubTrack({ fail: true });

    const detach = attachEchoLocalMicInterruptionRecovery(
      track as unknown as RecoverableLocalMicTrack,
      {
        shouldAutoRecover: () => true,
      },
    );

    track.mediaStreamTrack.emitEnded();

    // Backoff is RECOVERY_BACKOFF_MS (600) * attempt, so drain well past the
    // cumulative 600+1200+1800+2400ms of retry timers.
    await vi.advanceTimersByTimeAsync(10_000);

    // Capped at 4 attempts, then it gives up.
    expect(track.restartTrack).toHaveBeenCalledTimes(4);
    expect(mockDispatchAppToastDetail).toHaveBeenCalledTimes(1);

    const detail = mockDispatchAppToastDetail.mock.calls[0][0];
    expect(detail.severity).toBe('warning');
    expect(detail.actions?.[0]?.id).toBe('retry_local_mic_recovery');

    detach();
  });

  it('does not auto-recover on the Chromium path (shouldAutoRecover false)', async () => {
    const track = makeStubTrack();

    const detach = attachEchoLocalMicInterruptionRecovery(
      track as unknown as RecoverableLocalMicTrack,
      {
        shouldAutoRecover: () => false,
      },
    );

    track.mediaStreamTrack.emitEnded();
    await flushMicrotasks();

    track.mediaStreamTrack.emitMute();
    await vi.advanceTimersByTimeAsync(5000);

    expect(track.restartTrack).not.toHaveBeenCalled();
    expect(mockDispatchAppToastDetail).not.toHaveBeenCalled();

    detach();
  });

  it('detach() removes listeners and cancels pending timers', async () => {
    const track = makeStubTrack();

    const detach = attachEchoLocalMicInterruptionRecovery(
      track as unknown as RecoverableLocalMicTrack,
      {
        shouldAutoRecover: () => true,
      },
    );

    const mst = track.mediaStreamTrack;
    mst.emitMute(); // arms the watchdog
    detach();

    // Listener slots are cleared...
    expect(mst.onmute).toBeNull();
    expect(mst.onunmute).toBeNull();
    expect(mst.onended).toBeNull();

    // ...and the armed watchdog never fires post-detach.
    await vi.advanceTimersByTimeAsync(5000);
    expect(track.restartTrack).not.toHaveBeenCalled();

    // Events after detach are ignored.
    mst.emitEnded();
    await flushMicrotasks();
    expect(track.restartTrack).not.toHaveBeenCalled();
  });
});
