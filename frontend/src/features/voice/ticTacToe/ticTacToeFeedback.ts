import { useNotificationPreferencesStore } from '@/stores/notificationPreferences';

export type TicTacToeSfxKind =
  | 'placeX'
  | 'placeO'
  | 'win'
  | 'lose'
  | 'draw'
  | 'ping'
  | 'deny';

const TTT_SFX: Record<
  TicTacToeSfxKind,
  { frequencies: readonly number[]; duration: number; gain: number }
> = {
  placeX: { frequencies: [784, 988], duration: 0.072, gain: 0.021 },
  placeO: { frequencies: [523, 659], duration: 0.078, gain: 0.019 },
  win: { frequencies: [523, 659, 784, 988, 1175], duration: 0.16, gain: 0.026 },
  lose: { frequencies: [392, 330, 277, 220], duration: 0.2, gain: 0.016 },
  draw: { frequencies: [440, 554, 494, 440], duration: 0.14, gain: 0.018 },
  ping: { frequencies: [880, 1175], duration: 0.085, gain: 0.023 },
  deny: { frequencies: [320, 260], duration: 0.1, gain: 0.016 },
};

let tttSfxCtx: AudioContext | null = null;
let lastTttSfxAt = 0;

function getTttSfxContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!tttSfxCtx) {
    const win = window as Window &
      typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor = win.AudioContext ?? win.webkitAudioContext;
    if (!AudioContextCtor) return null;
    try {
      tttSfxCtx = new AudioContextCtor();
    } catch {
      return null;
    }
  }
  return tttSfxCtx;
}

function shouldSkipHaptics(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Short vibration patterns for game feedback (best-effort; ignored when unsupported).
 */
export function triggerTicTacToeHaptic(
  kind: 'place' | 'opp' | 'win' | 'lose' | 'draw' | 'invite',
): void {
  if (shouldSkipHaptics()) return;
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.vibrate !== 'function'
  )
    return;
  const patterns: Record<typeof kind, number | number[]> = {
    place: 10,
    opp: [6, 28, 6],
    win: [18, 35, 18, 35, 48],
    lose: [28, 32, 28],
    draw: [14, 22, 14],
    invite: [12, 40, 12, 40, 16],
  };
  try {
    navigator.vibrate(patterns[kind]);
  } catch {
    /* ignore */
  }
}

export function playTicTacToeSfx(kind: TicTacToeSfxKind): void {
  const prefs = useNotificationPreferencesStore();
  if (!prefs.settings.soundEffects) return;

  const now = Date.now();
  if (now - lastTttSfxAt < 55) return;
  lastTttSfxAt = now;

  const ctx = getTttSfxContext();
  const spec = TTT_SFX[kind];
  if (!ctx || !spec) return;

  const master =
    Math.max(0, Math.min(100, prefs.settings.soundEffectsMasterVolume)) / 100;
  const gain = spec.gain * master;
  if (gain <= 0) return;

  const start = () => {
    const baseTime = ctx.currentTime;
    spec.frequencies.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const t = baseTime + index * 0.042;
      osc.type = 'sine';
      osc.frequency.value = frequency;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(gain, t + 0.011);
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
