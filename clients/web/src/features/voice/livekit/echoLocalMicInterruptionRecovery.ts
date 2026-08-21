/**
 * Recover the local microphone when Safari / iOS interrupt or kill its capture track.
 *
 * Safari (macOS and iOS) interrupts the local mic `MediaStreamTrack` on phone/FaceTime calls,
 * Siri, audio-route changes (AirPods connect/disconnect), and app/tab backgrounding. On
 * interruption the track's READONLY `muted` flag flips to `true` — this is distinct from a user
 * mute, which toggles `enabled` — and the track frequently `ended`s outright. Safari does not
 * reliably fire `unmute` afterwards and does not re-acquire on its own, so the participant keeps
 * "publishing" a dead/silent track with no UI signal.
 *
 * This watches the underlying capture track and re-acquires via `LocalAudioTrack.restartTrack()`
 * when an interruption clears or the track dies, with capped retries + backoff, and surfaces a
 * toast if recovery ultimately fails. It is scoped to Safari-like / iOS browsers: on Chromium a
 * muted/ended local mic almost always means a genuine device removal, which is already handled by
 * the device-change UI rather than a silent re-acquire.
 */
import type { AudioCaptureOptions } from 'livekit-client';
import {
  isIosLikeBrowser,
  isSafariLikeBrowser,
} from '@/platform/browserCompatibility';
import { dispatchAppToastDetail } from '@/features/layout/failures/controllerMissingAction';
import { voiceClientDiag } from '@/observability/voiceClientTrace';

/** Structural slice of LiveKit `LocalAudioTrack` we depend on (keeps this unit testable). */
export interface RecoverableLocalMicTrack {
  readonly mediaStreamTrack: MediaStreamTrack;
  restartTrack(options?: AudioCaptureOptions): Promise<void>;
}

export interface EchoLocalMicRecoveryOptions {
  /** Capture options to re-apply on restart (device id + processing). */
  captureOptions?: () => AudioCaptureOptions | undefined;
  /** Called after a successful re-acquire so callers can refresh monitors / re-apply gain. */
  onRecovered?: () => void;
  /** Test seam — defaults to real Safari/iOS detection. */
  shouldAutoRecover?: () => boolean;
}

/** Safari sometimes mutes and never unmutes; if still interrupted this long, force a re-acquire. */
const MUTE_WATCHDOG_MS = 2500;
const MAX_RECOVERY_ATTEMPTS = 4;
const RECOVERY_BACKOFF_MS = 600;

export function attachEchoLocalMicInterruptionRecovery(
  track: RecoverableLocalMicTrack,
  options: EchoLocalMicRecoveryOptions = {},
): () => void {
  const autoRecover =
    options.shouldAutoRecover ??
    (() => isSafariLikeBrowser() || isIosLikeBrowser());

  let disposed = false;
  let attempts = 0;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let bound: MediaStreamTrack | null = null;

  function clearTimers() {
    if (watchdog != null) {
      clearTimeout(watchdog);
      watchdog = null;
    }
    if (retryTimer != null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function unbind() {
    if (!bound) return;
    bound.onmute = null;
    bound.onunmute = null;
    bound.onended = null;
    bound = null;
  }

  function bind(mst: MediaStreamTrack) {
    unbind();
    bound = mst;
    mst.onmute = handleMute;
    mst.onunmute = handleUnmute;
    mst.onended = handleEnded;
  }

  function handleMute() {
    if (disposed) return;
    voiceClientDiag('warn', 'voice.client:local_mic_interrupted', {
      reason: 'mute',
      readyState: bound?.readyState ?? 'none',
      autoRecover: autoRecover(),
    });
    if (watchdog != null) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      watchdog = null;
      // Still hardware-muted (interruption) after the grace window → Safari likely will not
      // self-heal. `muted` is the interruption flag, NOT the user mute (`enabled`).
      if (!disposed && bound && bound.muted) void recover('mute_watchdog');
    }, MUTE_WATCHDOG_MS);
  }

  function handleUnmute() {
    if (disposed) return;
    clearTimers();
    attempts = 0; // interruption cleared cleanly
    voiceClientDiag('info', 'voice.client:local_mic_resumed', {
      reason: 'unmute',
      readyState: bound?.readyState ?? 'none',
    });
    options.onRecovered?.();
  }

  function handleEnded() {
    if (disposed) return;
    voiceClientDiag('warn', 'voice.client:local_mic_interrupted', {
      reason: 'ended',
      autoRecover: autoRecover(),
    });
    void recover('ended');
  }

  function notifyRecoveryExhausted(trigger: string): void {
    voiceClientDiag('error', 'voice.client:local_mic_recovery_exhausted', {
      trigger,
      attempts,
    });
    dispatchAppToastDetail({
      message: 'Microphone interrupted',
      subtitle:
        'Your mic stopped after another app or a call took it over. Tap to reconnect it.',
      severity: 'warning',
      durationMs: 8000,
      actions: [
        {
          id: 'retry_local_mic_recovery',
          label: 'Reconnect mic',
          kind: 'primary',
          run: () => {
            attempts = 0;
            void recover('manual');
          },
        },
      ],
    });
  }

  async function recover(trigger: string): Promise<void> {
    if (disposed) return;
    if (!autoRecover()) return;
    if (attempts >= MAX_RECOVERY_ATTEMPTS) {
      notifyRecoveryExhausted(trigger);
      return;
    }
    attempts += 1;
    try {
      await track.restartTrack(options.captureOptions?.());
      if (disposed) return;
      // restartTrack swaps the underlying capture track — re-bind listeners to the new one.
      bind(track.mediaStreamTrack);
      attempts = 0;
      voiceClientDiag('info', 'voice.client:local_mic_recovered', {
        trigger,
        readyState: track.mediaStreamTrack.readyState,
      });
      options.onRecovered?.();
    } catch (e) {
      if (disposed) return;
      voiceClientDiag('warn', 'voice.client:local_mic_recovery_failed', {
        trigger,
        attempt: attempts,
        err: e instanceof Error ? e.message : String(e),
      });
      if (retryTimer != null) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void recover(trigger);
      }, RECOVERY_BACKOFF_MS * attempts);
    }
  }

  bind(track.mediaStreamTrack);

  return function detach() {
    disposed = true;
    clearTimers();
    unbind();
  };
}
