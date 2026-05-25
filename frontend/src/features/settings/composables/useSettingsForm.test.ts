import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsForm } from './useSettingsForm';

const lsStore: Record<string, string> = {};

function memoryLocalStorage(): Storage {
  return {
    get length() {
      return Object.keys(lsStore).length;
    },
    clear: () => {
      for (const k of Object.keys(lsStore)) delete lsStore[k];
    },
    getItem: (k: string) => (k in lsStore ? lsStore[k] : null),
    key: (i: number) => Object.keys(lsStore)[i] ?? null,
    removeItem: (k: string) => {
      delete lsStore[k];
    },
    setItem: (k: string, v: string) => {
      lsStore[k] = v;
    },
  } as Storage;
}

describe('useSettingsForm', () => {
  beforeEach(() => {
    for (const k of Object.keys(lsStore)) delete lsStore[k];
    vi.stubGlobal('localStorage', memoryLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hydrates voice processing toggles from localStorage on create', () => {
    localStorage.setItem(
      'echo_voice_processing_v1',
      JSON.stringify({
        v: 2,
        mode: 'browser',
        browser: {
          echoCancellation: false,
          noiseSuppression: false,
          automaticGainControl: false,
        },
        krisp: { useBVC: true, quality: 'low' },
      }),
    );

    const form = useSettingsForm();

    expect(form.voiceProcessingMode).toBe('browser');
    expect(form.voiceSettings.echoCancellation).toBe(false);
    expect(form.voiceSettings.noiseSuppression).toBe(false);
    expect(form.voiceSettings.automaticGainControl).toBe(false);
    expect(form.voiceKrispSettings.useBVC).toBe(true);
    expect(form.voiceKrispSettings.quality).toBe('low');
  });
});
