import { getIsIosSimulator } from '@/platform/iosNativeFeedback';

const SILENT_AUDIO_DATA_URL =
  'data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAAAA';

let unlockInstalled = false;
let unlocked = false;
const unlockCallbacks = new Set<() => void>();

function flushUnlockCallbacks(): void {
  const callbacks = [...unlockCallbacks];
  unlockCallbacks.clear();
  for (const cb of callbacks) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
}

async function primeHtmlAudioPlayback(): Promise<void> {
  if (typeof Audio === 'undefined') return;
  /* iOS Simulator: playing even a silent HTMLAudio clip starts the audio output
   * unit, whose CoreAudio RPC times out and aborts WebKit's GPU process. Skip on
   * the Simulator only; real devices and other targets are unaffected. */
  if (getIsIosSimulator()) return;
  const audio = new Audio(SILENT_AUDIO_DATA_URL);
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  audio.volume = 0;
  try {
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
  } catch {
    /* ignore */
  } finally {
    audio.removeAttribute('src');
    audio.load();
  }
}

function markAudioPlaybackUnlocked(): void {
  if (unlocked) return;
  unlocked = true;
  flushUnlockCallbacks();
  void primeHtmlAudioPlayback();
}

export function installGlobalAudioPlaybackUnlock(onUnlock?: () => void): void {
  if (onUnlock) {
    if (unlocked) onUnlock();
    else unlockCallbacks.add(onUnlock);
  }
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;

  const onFirstInteraction = () => {
    window.removeEventListener('pointerdown', onFirstInteraction, true);
    window.removeEventListener('keydown', onFirstInteraction, true);
    window.removeEventListener('touchstart', onFirstInteraction, true);
    markAudioPlaybackUnlocked();
  };

  window.addEventListener('pointerdown', onFirstInteraction, {
    once: true,
    passive: true,
    capture: true,
  });
  window.addEventListener('keydown', onFirstInteraction, {
    once: true,
    capture: true,
  });
  window.addEventListener('touchstart', onFirstInteraction, {
    once: true,
    passive: true,
    capture: true,
  });
}

export function isAudioPlaybackUnlocked(): boolean {
  return unlocked;
}

export function whenAudioPlaybackUnlocked(cb: () => void): () => void {
  if (unlocked) {
    cb();
    return () => {};
  }
  unlockCallbacks.add(cb);
  return () => {
    unlockCallbacks.delete(cb);
  };
}

export function isAudioPlaybackBlockedError(error: unknown): boolean {
  if (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    error.name === 'NotAllowedError'
  ) {
    return true;
  }
  if (error instanceof Error) {
    if (error.name === 'NotAllowedError') return true;
    const msg = error.message.toLowerCase();
    return (
      msg.includes('gesture') ||
      msg.includes('user interaction') ||
      msg.includes('notallowederror') ||
      msg.includes('play() failed')
    );
  }
  const text = String(error ?? '').toLowerCase();
  return text.includes('notallowederror') || text.includes('gesture');
}
