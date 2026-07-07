import type { AudioCaptureOptions } from 'livekit-client';
import { isSafariLikeBrowser } from '@/platform/browserCompatibility';
import type { EchoKrispNoiseFilterOptions } from '@/services/livekit/echoKrispTypes';
import { tryLocalStorageSetItem } from '@/utils/localStoragePersist';

export type VoiceProcessingMode = 'krisp' | 'browser' | 'native';

export type VoiceBrowserProcessingToggles = {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  automaticGainControl: boolean;
};

export type VoiceKrispProcessingToggles = {
  useBVC: boolean;
  quality: 'low' | 'medium' | 'high';
};

export type VoiceProcessingPreferencesV1 = {
  v: 1;
  mode: VoiceProcessingMode;
  browser: VoiceBrowserProcessingToggles;
};

export type VoiceProcessingPreferencesV2 = {
  v: 2;
  mode: VoiceProcessingMode;
  browser: VoiceBrowserProcessingToggles;
  krisp: VoiceKrispProcessingToggles;
};

export type VoiceProcessingPreferences =
  | VoiceProcessingPreferencesV1
  | VoiceProcessingPreferencesV2;

const STORAGE_KEY = 'echo_voice_processing_v1';

export const DEFAULT_VOICE_PROCESSING: VoiceProcessingPreferencesV2 = {
  v: 2,
  /** Browser DSP by default — LiveKit Krisp can throw async (e.g. private-field) and zero out mic bitrate. */
  mode: 'browser',
  browser: {
    echoCancellation: true,
    noiseSuppression: true,
    automaticGainControl: true,
  },
  krisp: {
    useBVC: false,
    quality: 'high',
  },
};

/** Client-aware default when no stored preference exists (Safari → native minimal processing). */
export function resolveDefaultVoiceProcessingPreferences(): VoiceProcessingPreferencesV2 {
  return {
    ...DEFAULT_VOICE_PROCESSING,
    mode: isSafariLikeBrowser() ? 'native' : DEFAULT_VOICE_PROCESSING.mode,
  };
}

function coerceMode(raw: unknown): VoiceProcessingMode {
  if (raw === 'krisp' || raw === 'browser' || raw === 'native') return raw;
  return resolveDefaultVoiceProcessingPreferences().mode;
}

function coerceKrispQuality(
  raw: unknown,
): VoiceKrispProcessingToggles['quality'] {
  if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;
  return DEFAULT_VOICE_PROCESSING.krisp.quality;
}

export function loadVoiceProcessingPreferences(): VoiceProcessingPreferencesV2 {
  const clientDefault = resolveDefaultVoiceProcessingPreferences();
  if (typeof localStorage === 'undefined') return { ...clientDefault };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...clientDefault };
    const parsed = JSON.parse(raw) as Partial<VoiceProcessingPreferences>;
    if (parsed.v !== 1 && parsed.v !== 2) return { ...clientDefault };
    const mode = coerceMode(parsed.mode);
    const browser = {
      echoCancellation:
        typeof parsed.browser?.echoCancellation === 'boolean'
          ? parsed.browser.echoCancellation
          : DEFAULT_VOICE_PROCESSING.browser.echoCancellation,
      noiseSuppression:
        typeof parsed.browser?.noiseSuppression === 'boolean'
          ? parsed.browser.noiseSuppression
          : DEFAULT_VOICE_PROCESSING.browser.noiseSuppression,
      automaticGainControl:
        typeof parsed.browser?.automaticGainControl === 'boolean'
          ? parsed.browser.automaticGainControl
          : DEFAULT_VOICE_PROCESSING.browser.automaticGainControl,
    };
    const krisp = {
      useBVC:
        typeof (parsed as Partial<VoiceProcessingPreferencesV2>).krisp
          ?.useBVC === 'boolean'
          ? !!(parsed as Partial<VoiceProcessingPreferencesV2>).krisp?.useBVC
          : DEFAULT_VOICE_PROCESSING.krisp.useBVC,
      quality: coerceKrispQuality(
        (parsed as Partial<VoiceProcessingPreferencesV2>).krisp?.quality,
      ),
    };
    return { v: 2, mode, browser, krisp };
  } catch {
    return { ...clientDefault };
  }
}

export function saveVoiceProcessingPreferences(
  prefs: VoiceProcessingPreferencesV2,
): void {
  tryLocalStorageSetItem(STORAGE_KEY, JSON.stringify(prefs));
}

/**
 * WebRTC capture constraints for the current mode.
 *
 * voiceIsolation must be explicit on every branch: livekit-client/src/room/defaults.ts
 * hardcodes audioDefaults.voiceIsolation = true and merges it into every mode that doesn't
 * override it. Chrome's ML voice isolation produces "chippy / cuts off early" artifacts and
 * must be explicitly disabled for krisp and native modes.
 *
 * Krisp: AEC on, browser NS off (Krisp owns suppression), AGC off (Krisp normalises levels —
 *   browser AGC and Krisp fight each other causing pumping artefacts), voiceIsolation off.
 * Browser: user toggles (defaults all on) + voiceIsolation as the stronger ML-based NS
 *   (falls back to noiseSuppression on unsupported browsers).
 * Native: all processing explicitly off — minimal processing request (OS may still apply DSP).
 */
export function buildAudioCaptureOptions(
  mode: VoiceProcessingMode,
  browser: VoiceBrowserProcessingToggles,
): AudioCaptureOptions {
  switch (mode) {
    case 'krisp':
      return {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
        voiceIsolation: false,
      };
    case 'browser':
      return {
        echoCancellation: browser.echoCancellation,
        noiseSuppression: browser.noiseSuppression,
        autoGainControl: browser.automaticGainControl,
        voiceIsolation: true,
      };
    case 'native':
      return {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        voiceIsolation: false,
      };
    default:
      return buildAudioCaptureOptions('browser', browser);
  }
}

function buildBrowserFallbackFromPrefs(
  prefs: VoiceProcessingPreferencesV2,
): AudioCaptureOptions {
  return buildAudioCaptureOptions('browser', prefs.browser);
}

/**
 * Effective capture mode when Krisp failed for this session — use browser row.
 */
export function effectiveCaptureMode(
  prefs: VoiceProcessingPreferencesV2,
  krispSessionFailed: boolean,
): VoiceProcessingMode {
  if (prefs.mode === 'krisp' && krispSessionFailed) return 'browser';
  return prefs.mode;
}

export function buildAudioCaptureOptionsForSession(
  prefs: VoiceProcessingPreferencesV2,
  krispSessionFailed: boolean,
): AudioCaptureOptions {
  const mode = effectiveCaptureMode(prefs, krispSessionFailed);
  return buildAudioCaptureOptions(mode, prefs.browser);
}

/** Fallback capture options after Krisp processor init failure (session-only). */
export function buildKrispFailureFallbackCaptureOptions(
  prefs: VoiceProcessingPreferencesV2,
): AudioCaptureOptions {
  return buildBrowserFallbackFromPrefs(prefs);
}

export function buildKrispNoiseFilterOptions(
  prefs: VoiceProcessingPreferencesV2,
): EchoKrispNoiseFilterOptions {
  return {
    quality: prefs.krisp.quality,
    useBVC: prefs.krisp.useBVC,
  };
}

/** Same constraints as `buildAudioCaptureOptionsForSession` for `getUserMedia({ audio })`. */
export function buildMediaTrackConstraints(
  prefs: VoiceProcessingPreferencesV2,
  krispSessionFailed: boolean,
): MediaTrackConstraints {
  const o = buildAudioCaptureOptionsForSession(prefs, krispSessionFailed);
  /** `voiceIsolation` is supported by Chromium; TS `MediaTrackConstraints` typings lag behind. */
  return {
    echoCancellation: o.echoCancellation,
    noiseSuppression: o.noiseSuppression,
    autoGainControl: o.autoGainControl,
    ...(typeof o.voiceIsolation === 'boolean'
      ? { voiceIsolation: o.voiceIsolation }
      : {}),
  } as MediaTrackConstraints;
}

/** Settings preview: use current form `mode` + browser toggles (Krisp row uses NS off). */
export function buildMediaTrackConstraintsFromForm(
  mode: VoiceProcessingMode,
  browser: VoiceBrowserProcessingToggles,
  krispSessionFailed: boolean,
): MediaTrackConstraints {
  return buildMediaTrackConstraints(
    {
      v: 2,
      mode,
      browser,
      krisp: { ...DEFAULT_VOICE_PROCESSING.krisp },
    },
    krispSessionFailed,
  );
}
