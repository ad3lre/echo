import { applyOutputSink } from '@/audio/applyOutputSink';
import { DESKTOP_NATIVE_AUDIO_ENABLED } from '@/config';
import { isDesktop } from '@/platform/desktopBridge';
import {
  isAudioPlaybackBlockedError,
  isAudioPlaybackUnlocked,
  whenAudioPlaybackUnlocked,
} from '@/audio/audioPlaybackUnlock';
import { CALL_RINGTONE_PLAYBACK_FALLBACK_URL } from '@/audio/callRingtoneAssets';
import {
  stopNativeRingtonePlayback,
  syncNativeRingtonePlayback,
} from '@/audio/callRingtoneNativePlayback';

let audio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;
let sinkAppliedForUrl: string | null = null;
let unlockRetryCleanup: (() => void) | null = null;
/** Bumped on stop / URL supersede so stale async work cannot restart audio. */
let playbackGeneration = 0;

function isCurrentGeneration(generation: number): boolean {
  return generation === playbackGeneration;
}

function bumpPlaybackGeneration(): number {
  playbackGeneration += 1;
  return playbackGeneration;
}

/** iOS Safari / some WebKit builds do not decode Ogg in `<audio>`. */
function htmlAudioCanPlayOggVorbis(): boolean {
  if (typeof Audio === 'undefined') return false;
  const t = new Audio().canPlayType('audio/ogg; codecs="vorbis"');
  return t === 'probably' || t === 'maybe';
}

function urlAppearsOggish(url: string): boolean {
  const s = url.trim();
  if (!s) return false;
  const low = s.toLowerCase();
  if (low.startsWith('data:')) {
    return (
      low.startsWith('data:audio/ogg') || low.startsWith('data:application/ogg')
    );
  }
  try {
    const path = new URL(s, window.location.href).pathname;
    return /\.og[ag]$/i.test(path) || /\.og[ag](\?|#)/i.test(path);
  } catch {
    return /\.og[ag](\?|#|$)/i.test(s);
  }
}

function resolveCallRingtonePlaybackUrl(url: string): string {
  if (htmlAudioCanPlayOggVorbis() || !urlAppearsOggish(url)) return url;
  return CALL_RINGTONE_PLAYBACK_FALLBACK_URL || url;
}

function clampVolume01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function clearUnlockRetry() {
  if (!unlockRetryCleanup) return;
  unlockRetryCleanup();
  unlockRetryCleanup = null;
}

function clearBrowserRingtoneElement(): void {
  if (!audio) return;
  audio.pause();
  audio.loop = false;
  audio.removeAttribute('src');
  audio.load();
  audio = null;
  activeUrl = null;
  sinkAppliedForUrl = null;
}

function scheduleRetryAfterUnlock(
  playbackUrl: string,
  element: HTMLAudioElement,
  generation: number,
): void {
  clearUnlockRetry();
  unlockRetryCleanup = whenAudioPlaybackUnlocked(() => {
    unlockRetryCleanup = null;
    if (
      audio !== element ||
      activeUrl !== playbackUrl ||
      !isCurrentGeneration(generation)
    ) {
      return;
    }
    void element.play().catch(() => {
      if (audio !== element || !isCurrentGeneration(generation)) return;
      stopCallRingtone();
    });
  });
}

/** Stops looped call ringtone playback and releases the element. */
export function stopCallRingtone(): void {
  bumpPlaybackGeneration();
  stopNativeRingtonePlayback();
  clearUnlockRetry();
  clearBrowserRingtoneElement();
}

function syncBrowserRingtone(playbackUrl: string, volume01: number): void {
  let generation = playbackGeneration;
  if (!audio || activeUrl !== playbackUrl) {
    stopCallRingtone();
    generation = playbackGeneration;
    audio = new Audio(playbackUrl);
    audio.loop = true;
    audio.preload = 'auto';
    audio.setAttribute('playsinline', '');
    activeUrl = playbackUrl;
    sinkAppliedForUrl = null;
    const element = audio;
    element.addEventListener(
      'error',
      () => {
        if (audio !== element || !isCurrentGeneration(generation)) return;
        stopCallRingtone();
      },
      { once: true },
    );
  }

  if (!audio) return;
  const element = audio;
  // Volume-only: set volume; do not re-play or re-setSinkId (both restart).
  element.volume = volume01;
  if (sinkAppliedForUrl !== playbackUrl) {
    sinkAppliedForUrl = playbackUrl;
    // applyOutputSink swallows setSinkId errors internally.
    void applyOutputSink(element);
  }
  if (!element.paused) return;
  void element.play().catch((error) => {
    if (audio !== element || !isCurrentGeneration(generation)) return;
    if (isAudioPlaybackBlockedError(error) && !isAudioPlaybackUnlocked()) {
      scheduleRetryAfterUnlock(playbackUrl, element, generation);
      return;
    }
    stopCallRingtone();
  });
}

/** Sync ringtone loop; volume changes must not restart from the start. */
export function syncCallRingtoneLoop(
  shouldPlay: boolean,
  url: string | null,
  volume01: number,
): void {
  // Stay alive at volume 0 so the fader does not tear down the loop.
  if (!shouldPlay || !url) {
    stopCallRingtone();
    return;
  }
  const playbackUrl = resolveCallRingtonePlaybackUrl(url);
  const v = clampVolume01(volume01);
  if (isDesktop() && DESKTOP_NATIVE_AUDIO_ENABLED) {
    void syncNativeRingtonePlayback(playbackUrl, v, {
      getGeneration: () => playbackGeneration,
      bumpGeneration: bumpPlaybackGeneration,
      isCurrent: isCurrentGeneration,
      syncBrowser: syncBrowserRingtone,
      clearBrowser: clearBrowserRingtoneElement,
    });
    return;
  }
  syncBrowserRingtone(playbackUrl, v);
}
