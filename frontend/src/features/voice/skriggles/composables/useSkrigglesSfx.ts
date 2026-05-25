import { useNotificationPreferencesStore } from '@/stores/notificationPreferences';

export type SkrigglesSfxKind = 'correct' | 'close' | 'tick' | 'round-end';

const SKRIGGLES_SFX: Record<
  SkrigglesSfxKind,
  { frequencies: readonly number[]; duration: number; gain: number }
> = {
  correct: { frequencies: [660, 880, 1047], duration: 0.12, gain: 0.028 },
  close: { frequencies: [520, 620], duration: 0.09, gain: 0.022 },
  tick: { frequencies: [440], duration: 0.05, gain: 0.018 },
  'round-end': { frequencies: [392, 523, 659], duration: 0.14, gain: 0.024 },
};

let skrigglesSfxCtx: AudioContext | null = null;
let lastSfxAt = 0;

function getSkrigglesSfxContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!skrigglesSfxCtx) {
    const win = window as Window &
      typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      };
    const AudioContextCtor = win.AudioContext ?? win.webkitAudioContext;
    if (!AudioContextCtor) return null;
    try {
      skrigglesSfxCtx = new AudioContextCtor();
    } catch {
      return null;
    }
  }
  return skrigglesSfxCtx;
}

export function useSkrigglesSfx() {
  const notificationPreferences = useNotificationPreferencesStore();

  function playSkrigglesSfx(kind: SkrigglesSfxKind): void {
    if (!notificationPreferences.settings.soundEffects) return;
    const now = Date.now();
    if (now - lastSfxAt < 60) return;
    lastSfxAt = now;

    const ctx = getSkrigglesSfxContext();
    const spec = SKRIGGLES_SFX[kind];
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
        const t = baseTime + index * 0.042;
        osc.type = 'sine';
        osc.frequency.value = frequency;
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
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

  return { playSkrigglesSfx };
}
