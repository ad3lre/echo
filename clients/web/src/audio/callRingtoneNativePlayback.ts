import { DESKTOP_NATIVE_AUDIO_ENABLED } from '@/config';
import {
  initDesktopNativeAudio,
  isDesktop,
  playDesktopNativeRingtone,
  setDesktopNativeRingtoneVolume,
  stopDesktopNativeRingtone,
} from '@/platform/desktopBridge';

let nativeAudioReady = false;
let nativePlaybackUrl: string | null = null;
let nativePlaybackVolume = -1;
const nativeRingtoneBytesCache = new Map<string, Uint8Array>();

export type CallRingtoneNativeDeps = {
  getGeneration: () => number;
  bumpGeneration: () => number;
  isCurrent: (generation: number) => boolean;
  syncBrowser: (playbackUrl: string, volume01: number) => void;
  clearBrowser: () => void;
};

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

export function stopNativeRingtonePlayback(): void {
  if (!(isDesktop() && DESKTOP_NATIVE_AUDIO_ENABLED)) return;
  void stopDesktopNativeRingtone().catch(() => {});
  nativePlaybackUrl = null;
  nativePlaybackVolume = -1;
}

async function applyNativeVolume(
  volume01: number,
  generation: number,
  isCurrent: (generation: number) => boolean,
): Promise<void> {
  if (Math.abs(nativePlaybackVolume - volume01) < 0.001) return;
  await setDesktopNativeRingtoneVolume(volume01);
  if (!isCurrent(generation)) return;
  nativePlaybackVolume = volume01;
}

/**
 * Native looping ringtone with live volume updates. Generation bumps only when
 * starting or swapping a clip so volume fader ticks do not cancel in-flight play.
 */
export async function syncNativeRingtonePlayback(
  playbackUrl: string,
  volume01: number,
  deps: CallRingtoneNativeDeps,
): Promise<void> {
  const {
    getGeneration,
    bumpGeneration,
    isCurrent,
    syncBrowser,
    clearBrowser,
  } = deps;

  if (nativePlaybackUrl === playbackUrl) {
    await applyNativeVolume(volume01, getGeneration(), isCurrent);
    return;
  }

  const generation = bumpGeneration();
  clearBrowser();
  // Drop ownership immediately so a superseded load cannot leave a stale URL.
  nativePlaybackUrl = null;
  nativePlaybackVolume = -1;
  void stopDesktopNativeRingtone().catch(() => {});
  try {
    if (!(await ensureNativeAudioReady())) {
      if (!isCurrent(generation)) return;
      syncBrowser(playbackUrl, volume01);
      return;
    }
    if (!isCurrent(generation)) return;
    const audioBytes = await loadRingtoneBytes(playbackUrl);
    if (!isCurrent(generation)) return;
    await playDesktopNativeRingtone({
      audioBytes,
      looped: true,
      volume01,
    });
    if (!isCurrent(generation)) {
      void stopDesktopNativeRingtone().catch(() => {});
      return;
    }
    nativePlaybackUrl = playbackUrl;
    nativePlaybackVolume = volume01;
  } catch (error) {
    if (!isCurrent(generation)) return;
    console.warn(
      '[echo-audio] native ringtone failed; using browser path',
      error,
    );
    void stopDesktopNativeRingtone().catch(() => {});
    nativePlaybackUrl = null;
    nativePlaybackVolume = -1;
    syncBrowser(playbackUrl, volume01);
  }
}
