import { useNotificationPreferencesStore } from '@/stores/notificationPreferences';

/**
 * A single voice-game sound effect: a short stack of sine tones played in
 * sequence to form a chime. `gain` is the per-effect peak before the user's
 * master volume is applied.
 */
export type VoiceGameSfxSpec = {
  frequencies: readonly number[];
  duration: number;
  gain: number;
};

export type VoiceGameSfxOptions = {
  /** Minimum gap between effects, in ms, to avoid machine-gun retriggers. */
  throttleMs?: number;
  /** Attack ramp to peak gain, in ms. */
  rampMs?: number;
  /** Delay between successive tones in a chime, in ms. */
  staggerMs?: number;
};

const DEFAULT_THROTTLE_MS = 60;
const DEFAULT_RAMP_MS = 10;
const DEFAULT_STAGGER_MS = 42;

// One AudioContext and throttle clock shared across every voice game — only one
// activity is ever audible at a time, so a single lazily-created context is enough.
let sharedSfxCtx: AudioContext | null = null;
let lastSfxAt = 0;

function getSharedSfxContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedSfxCtx) {
    const win = window as Window &
      typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      };
    const AudioContextCtor = win.AudioContext ?? win.webkitAudioContext;
    if (!AudioContextCtor) return null;
    try {
      sharedSfxCtx = new AudioContextCtor();
    } catch {
      return null;
    }
  }
  return sharedSfxCtx;
}

/**
 * Parameterized WebAudio chime engine shared by the voice mini-games. Each game
 * supplies its own typed spec table; `play(kind)` respects the user's sound-effect
 * preference and master volume. Replaces the per-game copies that previously lived
 * inline in each game component.
 */
export function useVoiceGameSfx<K extends string>(
  specs: Record<K, VoiceGameSfxSpec>,
  options: VoiceGameSfxOptions = {},
): { play: (kind: K) => void } {
  const notificationPreferences = useNotificationPreferencesStore();
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  const rampSec = (options.rampMs ?? DEFAULT_RAMP_MS) / 1000;
  const staggerSec = (options.staggerMs ?? DEFAULT_STAGGER_MS) / 1000;

  function play(kind: K): void {
    if (!notificationPreferences.settings.soundEffects) return;
    const now = Date.now();
    if (now - lastSfxAt < throttleMs) return;
    lastSfxAt = now;

    const ctx = getSharedSfxContext();
    const spec = specs[kind];
    if (!ctx || !spec) return;

    const master =
      Math.max(
        0,
        Math.min(
          100,
          notificationPreferences.settings.soundEffectsMasterVolume,
        ),
      ) / 100;
    const gain = spec.gain * master;
    if (gain <= 0) return;

    const start = () => {
      const baseTime = ctx.currentTime;
      spec.frequencies.forEach((frequency, index) => {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        const t = baseTime + index * staggerSec;
        osc.type = 'sine';
        osc.frequency.value = frequency;
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(gain, t + rampSec);
        env.gain.exponentialRampToValueAtTime(0.0001, t + spec.duration);
        osc.connect(env);
        env.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + spec.duration + 0.02);
      });
    };

    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(start)
        .catch(() => {});
      return;
    }
    start();
  }

  return { play };
}
