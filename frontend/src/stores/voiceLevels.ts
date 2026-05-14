import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { tryLocalStorageSetItem } from '@/utils/localStoragePersist';

const STORAGE_KEY = 'echo-voice-levels-v1';

type Persisted = {
  maxBoostEnabled: boolean;
  maxBoostLevel: number;
  outputVolumePercent: number;
  inputSensitivityPercent: number;
  voiceActivationThresholdPercent: number;
  outboundGateMode: 'none' | 'soft' | 'hard';
};

const UI_PERCENT_MAX = 100;
const BOOST_LEVEL_MIN = 2;
const BOOST_LEVEL_MAX = 6;
const PERSIST_DEBOUNCE_MS = 200;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function load(): Persisted {
  if (typeof localStorage === 'undefined') {
    return {
      maxBoostEnabled: false,
      maxBoostLevel: 2,
      outputVolumePercent: 100,
      inputSensitivityPercent: 100,
      voiceActivationThresholdPercent: 24,
      outboundGateMode: 'soft',
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        maxBoostEnabled: false,
        maxBoostLevel: 2,
        outputVolumePercent: 100,
        inputSensitivityPercent: 100,
        voiceActivationThresholdPercent: 24,
        outboundGateMode: 'soft',
      };
    }
    const j = JSON.parse(raw) as Partial<Persisted>;
    const maxBoostEnabled = !!j.maxBoostEnabled;
    const maxBoostLevel = clamp(
      typeof j.maxBoostLevel === 'number' ? j.maxBoostLevel : BOOST_LEVEL_MIN,
      BOOST_LEVEL_MIN,
      BOOST_LEVEL_MAX,
    );
    return {
      maxBoostEnabled,
      maxBoostLevel,
      outputVolumePercent: clamp(
        typeof j.outputVolumePercent === 'number' ? j.outputVolumePercent : 100,
        0,
        UI_PERCENT_MAX,
      ),
      inputSensitivityPercent: clamp(
        typeof j.inputSensitivityPercent === 'number'
          ? j.inputSensitivityPercent
          : 100,
        0,
        UI_PERCENT_MAX,
      ),
      voiceActivationThresholdPercent: clamp(
        typeof j.voiceActivationThresholdPercent === 'number'
          ? j.voiceActivationThresholdPercent
          : 24,
        0,
        100,
      ),
      outboundGateMode:
        j.outboundGateMode === 'none'
          ? 'none'
          : j.outboundGateMode === 'hard'
            ? 'hard'
            : 'soft',
    };
  } catch {
    return {
      maxBoostEnabled: false,
      maxBoostLevel: 2,
      outputVolumePercent: 100,
      inputSensitivityPercent: 100,
      voiceActivationThresholdPercent: 24,
      outboundGateMode: 'soft',
    };
  }
}

/**
 * Voice I/O levels shared by Settings, VC panel, and LiveKit playback levels.
 * Base sliders stay 0–100; max boost applies an output gain multiplier (2x–6x).
 */
export const useVoiceLevelsStore = defineStore('voiceLevels', () => {
  const initial = load();
  const maxBoostEnabled = ref(initial.maxBoostEnabled);
  const maxBoostLevel = ref(initial.maxBoostLevel);
  const outputVolumePercent = ref(initial.outputVolumePercent);
  const inputSensitivityPercent = ref(initial.inputSensitivityPercent);
  const voiceActivationThresholdPercent = ref(
    initial.voiceActivationThresholdPercent,
  );
  const outboundGateMode = ref<'none' | 'soft' | 'hard'>(
    initial.outboundGateMode,
  );

  const sliderMax = computed(() => UI_PERCENT_MAX);

  function buildAudioModel(
    uiPercent: number,
    boostEnabled: boolean,
    boostLevel: number,
  ): {
    uiPercent: number;
    cap: number;
    gain: number;
    effectivePercent: number;
  } {
    const normalizedPercent = clamp(uiPercent, 0, UI_PERCENT_MAX);
    const cap = boostEnabled
      ? clamp(boostLevel, BOOST_LEVEL_MIN, BOOST_LEVEL_MAX)
      : 1;
    const gain = Math.max(0, Math.min(cap, (normalizedPercent / 100) * cap));
    return {
      uiPercent: normalizedPercent,
      cap,
      gain,
      effectivePercent: Math.round(gain * 100),
    };
  }

  /** Linear gain 0–6 for Web Audio / LiveKit `setVolume` where supported. */
  const outputGain = computed(() => {
    return buildAudioModel(
      outputVolumePercent.value,
      maxBoostEnabled.value,
      maxBoostLevel.value,
    ).gain;
  });

  const inputGain = computed(() => {
    return buildAudioModel(
      inputSensitivityPercent.value,
      maxBoostEnabled.value,
      maxBoostLevel.value,
    ).gain;
  });

  const outputEffectivePercent = computed(
    () =>
      buildAudioModel(
        outputVolumePercent.value,
        maxBoostEnabled.value,
        maxBoostLevel.value,
      ).effectivePercent,
  );
  const inputEffectivePercent = computed(
    () =>
      buildAudioModel(
        inputSensitivityPercent.value,
        maxBoostEnabled.value,
        maxBoostLevel.value,
      ).effectivePercent,
  );

  function persist() {
    const payload: Persisted = {
      maxBoostEnabled: maxBoostEnabled.value,
      maxBoostLevel: maxBoostLevel.value,
      outputVolumePercent: outputVolumePercent.value,
      inputSensitivityPercent: inputSensitivityPercent.value,
      voiceActivationThresholdPercent: voiceActivationThresholdPercent.value,
      outboundGateMode: outboundGateMode.value,
    };
    tryLocalStorageSetItem(STORAGE_KEY, JSON.stringify(payload));
  }

  let persistTimeout: ReturnType<typeof setTimeout> | null = null;
  watch(
    [
      maxBoostEnabled,
      maxBoostLevel,
      outputVolumePercent,
      inputSensitivityPercent,
      voiceActivationThresholdPercent,
      outboundGateMode,
    ],
    () => {
      if (persistTimeout) clearTimeout(persistTimeout);
      persistTimeout = setTimeout(() => {
        persistTimeout = null;
        persist();
      }, PERSIST_DEBOUNCE_MS);
    },
  );

  function setMaxBoostEnabled(on: boolean) {
    maxBoostEnabled.value = on;
  }

  function setMaxBoostLevel(level: number) {
    maxBoostLevel.value = clamp(level, BOOST_LEVEL_MIN, BOOST_LEVEL_MAX);
  }

  /**
   * Explicit normalization helper for UI/state migrations.
   * Kept separate from boost toggles to avoid hidden mutation side-effects.
   */
  function normalizeUiPercents(): void {
    outputVolumePercent.value = clamp(
      outputVolumePercent.value,
      0,
      UI_PERCENT_MAX,
    );
    inputSensitivityPercent.value = clamp(
      inputSensitivityPercent.value,
      0,
      UI_PERCENT_MAX,
    );
  }

  function setOutputVolumePercent(v: number) {
    outputVolumePercent.value = clamp(v, 0, UI_PERCENT_MAX);
  }

  function setInputSensitivityPercent(v: number) {
    inputSensitivityPercent.value = clamp(v, 0, UI_PERCENT_MAX);
  }

  function setVoiceActivationThresholdPercent(v: number) {
    voiceActivationThresholdPercent.value = clamp(v, 0, 100);
  }

  function setOutboundGateMode(mode: 'none' | 'soft' | 'hard') {
    outboundGateMode.value = mode;
  }

  return {
    maxBoostEnabled,
    maxBoostLevel,
    outputVolumePercent,
    inputSensitivityPercent,
    voiceActivationThresholdPercent,
    outboundGateMode,
    sliderMax,
    outputGain,
    inputGain,
    outputEffectivePercent,
    inputEffectivePercent,
    setMaxBoostEnabled,
    setMaxBoostLevel,
    normalizeUiPercents,
    setOutputVolumePercent,
    setInputSensitivityPercent,
    setVoiceActivationThresholdPercent,
    setOutboundGateMode,
  };
});
