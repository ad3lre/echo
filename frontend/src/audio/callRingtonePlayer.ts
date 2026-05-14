import { applyOutputSink } from '@/audio/applyOutputSink';
import { DESKTOP_NATIVE_AUDIO_ENABLED } from '@/config';
import {
  initDesktopNativeAudio,
  isDesktop,
  playDesktopNativeRingtone,
  stopDesktopNativeRingtone,
} from '@/platform/desktopBridge';
import {
  isAudioPlaybackBlockedError,
  isAudioPlaybackUnlocked,
  whenAudioPlaybackUnlocked,
} from '@/audio/audioPlaybackUnlock';
import { CALL_RINGTONE_PLAYBACK_FALLBACK_URL } from '@/audio/callRingtoneAssets';

let audio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;
let unlockRetryCleanup: (() => void) | null = null;
let nativeAudioReady = false;
let nativePlaybackUrl: string | null = null;
let nativePlaybackVolume = -1;
const nativeRingtoneBytesCache = new Map<string, Uint8Array>();

/** iOS Safari and some WebKit builds do not decode Ogg in `<audio>`. */
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

/**
 * Use a bundled MP3 when the selected source is Ogg and the engine cannot play it
 * (decode `error` on iOS would otherwise stop the loop with no sound).
 */
function resolveCallRingtonePlaybackUrl(url: string): string {
  if (htmlAudioCanPlayOggVorbis() || !urlAppearsOggish(url)) {
    return url;
  }
  return CALL_RINGTONE_PLAYBACK_FALLBACK_URL || url;
}

function clearUnlockRetry() {
  if (!unlockRetryCleanup) return;
  unlockRetryCleanup();
  unlockRetryCleanup = null;
}

function scheduleRetryAfterUnlock(playbackUrl: string): void {
  clearUnlockRetry();
  unlockRetryCleanup = whenAudioPlaybackUnlocked(() => {
    unlockRetryCleanup = null;
    if (!audio || activeUrl !== playbackUrl) return;
    void audio.play().catch(() => {
      stopCallRingtone();
    });
  });
}

/** Stops looped call ringtone playback and releases the element. */
export function stopCallRingtone(): void {
  if (isDesktop() && DESKTOP_NATIVE_AUDIO_ENABLED) {
    void stopDesktopNativeRingtone().catch(() => {});
    nativePlaybackUrl = null;
    nativePlaybackVolume = -1;
  }
  clearUnlockRetry();
  if (audio) {
    audio.pause();
    audio.loop = false;
    audio.removeAttribute('src');
    audio.load();
    audio = null;
  }
  activeUrl = null;
}

async function ensureNativeAudioReady(): Promise<boolean> {
  if (!(isDesktop() && DESKTOP_NATIVE_AUDIO_ENABLED)) return false;
  if (nativeAudioReady) return true;
  try {
    await initDesktopNativeAudio();
    nativeAudioReady = true;
    return true;
  } catch {
    return false;
  }
}

async function loadRingtoneBytes(url: string): Promise<Uint8Array> {
  const cached = nativeRingtoneBytesCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ringtone fetch failed: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  nativeRingtoneBytesCache.set(url, bytes);
  return bytes;
}

function syncBrowserRingtone(playbackUrl: string, volume01: number): void {
  if (!audio || activeUrl !== playbackUrl) {
    stopCallRingtone();
    audio = new Audio(playbackUrl);
    audio.loop = true;
    audio.preload = 'auto';
    audio.setAttribute('playsinline', '');
    activeUrl = playbackUrl;
    audio.addEventListener(
      'error',
      () => {
        stopCallRingtone();
      },
      { once: true },
    );
  }

  if (!audio) return;
  audio.volume = volume01;
  void applyOutputSink(audio);
  void audio.play().catch((error) => {
    if (isAudioPlaybackBlockedError(error) && !isAudioPlaybackUnlocked()) {
      scheduleRetryAfterUnlock(playbackUrl);
      return;
    }
    stopCallRingtone();
  });
}

/**
 * Keeps a looping ringtone in sync: starts / swaps URL / updates volume / stops.
 * Uses HTMLAudioElement (MP3) separate from OGG `useEchoSounds` buffer cache.
 */
export function syncCallRingtoneLoop(
  shouldPlay: boolean,
  url: string | null,
  volume01: number,
): void {
  if (!shouldPlay || !url || volume01 <= 0) {
    stopCallRingtone();
    return;
  }

  const playbackUrl = resolveCallRingtonePlaybackUrl(url);
  const v = Math.min(1, Math.max(0, volume01));

  if (isDesktop() && DESKTOP_NATIVE_AUDIO_ENABLED) {
    void (async () => {
      try {
        const canUseNative = await ensureNativeAudioReady();
        if (!canUseNative) {
          syncBrowserRingtone(playbackUrl, v);
          return;
        }
        if (
          nativePlaybackUrl === playbackUrl &&
          Math.abs(nativePlaybackVolume - v) < 0.01
        ) {
          return;
        }
        const audioBytes = await loadRingtoneBytes(playbackUrl);
        await playDesktopNativeRingtone({
          audioBytes,
          looped: true,
          volume01: v,
        });
        nativePlaybackUrl = playbackUrl;
        nativePlaybackVolume = v;
        if (audio) {
          audio.pause();
          audio = null;
          activeUrl = null;
        }
      } catch (error) {
        console.warn(
          '[echo-audio] native ringtone failed; using browser path',
          error,
        );
        nativePlaybackUrl = null;
        nativePlaybackVolume = -1;
        syncBrowserRingtone(playbackUrl, v);
      }
    })();
    return;
  }
  syncBrowserRingtone(playbackUrl, v);
}
