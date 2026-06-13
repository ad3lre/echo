import {
  useVoiceGameSfx,
  type VoiceGameSfxSpec,
} from '@/features/voice/composables/useVoiceGameSfx';

export type SkrigglesSfxKind = 'correct' | 'close' | 'tick' | 'round-end';

const SKRIGGLES_SFX: Record<SkrigglesSfxKind, VoiceGameSfxSpec> = {
  correct: { frequencies: [660, 880, 1047], duration: 0.12, gain: 0.028 },
  close: { frequencies: [520, 620], duration: 0.09, gain: 0.022 },
  tick: { frequencies: [440], duration: 0.05, gain: 0.018 },
  'round-end': { frequencies: [392, 523, 659], duration: 0.14, gain: 0.024 },
};

export function useSkrigglesSfx() {
  const { play } = useVoiceGameSfx(SKRIGGLES_SFX);
  return { playSkrigglesSfx: play };
}
