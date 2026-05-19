import { defineStore } from 'pinia';
import { ref } from 'vue';
import { normalizeAudioOutputDeviceId } from '@/platform/browserCompatibility';
import { tryLocalStorageSetItem } from '@/utils/localStoragePersist';

const STORAGE_OUT = 'echo-ui-audio-output-device';
const STORAGE_IN = 'echo-ui-audio-input-device';
const DEFAULT_AUDIO_DEVICE = 'default';

type AudioDeviceId = string;

function normalizeInputDeviceId(id: string | null | undefined): AudioDeviceId {
  const trimmed = id?.trim();
  return trimmed ? trimmed : DEFAULT_AUDIO_DEVICE;
}

function loadOut(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_AUDIO_DEVICE;
  try {
    const raw = localStorage.getItem(STORAGE_OUT);
    if (raw) return normalizeAudioOutputDeviceId(raw);
  } catch {
    /* ignore */
  }
  return DEFAULT_AUDIO_DEVICE;
}

function loadIn(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_AUDIO_DEVICE;
  try {
    const raw = localStorage.getItem(STORAGE_IN);
    if (raw) return normalizeInputDeviceId(raw);
  } catch {
    /* ignore */
  }
  return DEFAULT_AUDIO_DEVICE;
}

/**
 * Single source of truth for selected input/output device ids (browser deviceId
 * strings, or `default`). Used by VC panel, Settings voice UI, and UI sound playback.
 */
export const useUiAudioDevicesStore = defineStore('uiAudioDevices', () => {
  const outputSinkId = ref<AudioDeviceId>(loadOut());
  const inputDeviceId = ref<AudioDeviceId>(loadIn());

  function persist() {
    tryLocalStorageSetItem(STORAGE_OUT, outputSinkId.value);
    tryLocalStorageSetItem(STORAGE_IN, inputDeviceId.value);
  }

  function setOutputSink(id: string) {
    outputSinkId.value = normalizeAudioOutputDeviceId(id);
    persist();
  }

  function setInputDevice(id: string) {
    inputDeviceId.value = normalizeInputDeviceId(id);
    persist();
  }

  function setDevices(next: {
    outputSinkId?: string | null;
    inputDeviceId?: string | null;
  }) {
    if (next.outputSinkId !== undefined) {
      outputSinkId.value = normalizeAudioOutputDeviceId(next.outputSinkId);
    }
    if (next.inputDeviceId !== undefined) {
      inputDeviceId.value = normalizeInputDeviceId(next.inputDeviceId);
    }
    persist();
  }

  return {
    outputSinkId,
    inputDeviceId,
    setOutputSink,
    setInputDevice,
    setDevices,
  };
});
