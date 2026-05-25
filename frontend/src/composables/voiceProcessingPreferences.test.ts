import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAudioCaptureOptions,
  buildAudioCaptureOptionsForSession,
  buildKrispNoiseFilterOptions,
  DEFAULT_VOICE_PROCESSING,
  loadVoiceProcessingPreferences,
  saveVoiceProcessingPreferences,
} from './voiceProcessingPreferences';

/** Node/Vitest may expose a broken `localStorage`; use an in-memory stub for save/load tests. */
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

describe('voiceProcessingPreferences', () => {
  beforeEach(() => {
    for (const k of Object.keys(lsStore)) delete lsStore[k];
    vi.stubGlobal('localStorage', memoryLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to browser mode in DEFAULT_VOICE_PROCESSING', () => {
    expect(DEFAULT_VOICE_PROCESSING.mode).toBe('browser');
  });

  it('Krisp mode uses browser NS off in capture options', () => {
    const o = buildAudioCaptureOptions(
      'krisp',
      DEFAULT_VOICE_PROCESSING.browser,
    );
    expect(o.echoCancellation).toBe(true);
    expect(o.noiseSuppression).toBe(false);
    expect(o.autoGainControl).toBe(false);
  });

  it('browser mode follows toggles', () => {
    const o = buildAudioCaptureOptions('browser', {
      echoCancellation: false,
      noiseSuppression: true,
      automaticGainControl: false,
    });
    expect(o.echoCancellation).toBe(false);
    expect(o.noiseSuppression).toBe(true);
    expect(o.autoGainControl).toBe(false);
  });

  it('native mode turns off browser DSP flags', () => {
    const o = buildAudioCaptureOptions(
      'native',
      DEFAULT_VOICE_PROCESSING.browser,
    );
    expect(o.echoCancellation).toBe(false);
    expect(o.noiseSuppression).toBe(false);
    expect(o.autoGainControl).toBe(false);
  });

  it('effectiveCaptureMode falls back to browser when Krisp failed this session', () => {
    const prefs = { ...DEFAULT_VOICE_PROCESSING, mode: 'krisp' as const };
    const o = buildAudioCaptureOptionsForSession(prefs, true);
    expect(o.noiseSuppression).toBe(true);
    expect(o.echoCancellation).toBe(true);
  });

  it('persists disabled browser DSP toggles', () => {
    saveVoiceProcessingPreferences({
      v: 2,
      mode: 'browser',
      browser: {
        echoCancellation: false,
        noiseSuppression: false,
        automaticGainControl: false,
      },
      krisp: DEFAULT_VOICE_PROCESSING.krisp,
    });
    const loaded = loadVoiceProcessingPreferences();
    expect(loaded.browser.echoCancellation).toBe(false);
    expect(loaded.browser.noiseSuppression).toBe(false);
    expect(loaded.browser.automaticGainControl).toBe(false);
  });

  it('round-trips localStorage', () => {
    saveVoiceProcessingPreferences({
      v: 2,
      mode: 'browser',
      browser: {
        echoCancellation: true,
        noiseSuppression: false,
        automaticGainControl: true,
      },
      krisp: {
        useBVC: true,
        quality: 'high',
      },
    });
    const loaded = loadVoiceProcessingPreferences();
    expect(loaded.mode).toBe('browser');
    expect(loaded.browser.noiseSuppression).toBe(false);
    expect(loaded.krisp.useBVC).toBe(true);
    expect(loaded.krisp.quality).toBe('high');
  });

  it('migrates v1 localStorage records to v2 defaults for krisp options', () => {
    localStorage.setItem(
      'echo_voice_processing_v1',
      JSON.stringify({
        v: 1,
        mode: 'krisp',
        browser: {
          echoCancellation: true,
          noiseSuppression: false,
          automaticGainControl: true,
        },
      }),
    );

    const loaded = loadVoiceProcessingPreferences();

    expect(loaded.v).toBe(2);
    expect(loaded.mode).toBe('krisp');
    expect(loaded.krisp.useBVC).toBe(false);
    expect(loaded.krisp.quality).toBe(DEFAULT_VOICE_PROCESSING.krisp.quality);
  });

  it('builds krisp filter options from preferences', () => {
    const options = buildKrispNoiseFilterOptions({
      ...DEFAULT_VOICE_PROCESSING,
      mode: 'krisp',
      krisp: {
        useBVC: true,
        quality: 'low',
      },
    });

    expect(options).toEqual({
      useBVC: true,
      quality: 'low',
    });
  });
});
