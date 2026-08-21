import { useNotificationPreferencesStore } from '@/features/settings/notificationPreferences';
import {
  echoSoundUrl,
  ECHO_SOUND_IDS,
  ECHO_SOUND_SOURCE_FILES,
  type EchoSoundId,
} from '@/audio/echoSoundAssets';
import { icons } from '@/assets/icons';
import {
  applyOutputSink,
  applyOutputSinkToAudioContext,
} from '@/audio/applyOutputSink';
import {
  installGlobalAudioPlaybackUnlock,
  isAudioPlaybackBlockedError,
  isAudioPlaybackUnlocked,
  whenAudioPlaybackUnlocked,
} from '@/audio/audioPlaybackUnlock';
import { pushEchoSoundTransientSession } from '@/audio/echoSoundAudioSession';
import { DESKTOP_NATIVE_AUDIO_ENABLED } from '@/config';
import {
  initDesktopNativeAudio,
  isDesktop,
  playDesktopNativeRingtone,
} from '@/platform/desktopBridge';
import { dispatchAppToastDetail } from '@/features/layout/failures/controllerMissingAction';

const ECHO_SOUND_DEBUG =
  import.meta.env.DEV ||
  (typeof localStorage !== 'undefined' &&
    localStorage.getItem('echoSoundDebug') === '1');

function logEchoSoundVerbose(_msg: string, _meta: Record<string, unknown>) {
  if (!ECHO_SOUND_DEBUG) return;
}

function logEchoSoundWarn(_msg: string, _meta: Record<string, unknown>) {}

/** When bundled OGG fails to load or `play()` fails — distinct Hz per id. */
const SYNTH_HZ: Record<EchoSoundId, number> = {
  streamStart: 523,
  streamEnd: 392,
  videoStart: 659,
  videoEnd: 349,
  streamJoinSelf: 784,
  streamViewerArrive: 587,
  joinVoiceChannel: 587,
  streamViewerLeave: 440,
  pttOn: 880,
  pttOff: 523,
  vcMute: 400,
  vcUnmute: 640,
  vcDeafen: 320,
  vcUndeafen: 720,
  pingActive: 600,
  pingDirectMention: 520,
  pingDm: 680,
  pingEveryone: 400,
  leaveVc: 360,
};

let audioCtx: AudioContext | null = null;
let desktopNativeAudioReady = false;
const desktopEchoSoundBytesCache = new Map<string, Uint8Array>();

function onAudioPlaybackUnlocked(): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
}

installGlobalAudioPlaybackUnlock(onAudioPlaybackUnlocked);

/** Cooldown so a burst of failed sounds (e.g. many pings) does not stack toasts. */
const SYNTHETIC_FALLBACK_TOAST_COOLDOWN_MS = 120_000;
let lastSyntheticFallbackToastAt = 0;

function notifyEchoSoundSyntheticFallback(): void {
  const now = Date.now();
  if (
    now - lastSyntheticFallbackToastAt <
    SYNTHETIC_FALLBACK_TOAST_COOLDOWN_MS
  ) {
    return;
  }
  lastSyntheticFallbackToastAt = now;
  dispatchAppToastDetail({
    title: 'Sound effect could not play normally',
    message:
      'Echo played a short tone instead. This can happen when the browser or audio output is in a bad state—you may hear brief beeps. Reloading the page usually fixes it.',
    severity: 'warning',
    durationMs: 10_000,
  });
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

export function primeEchoAudioPlayback(): void {
  onAudioPlaybackUnlocked();
  if (isDesktop() && DESKTOP_NATIVE_AUDIO_ENABLED) {
    void initDesktopNativeAudio()
      .then(() => {
        desktopNativeAudioReady = true;
      })
      .catch(() => {});
  }
}

/** Decoded clips for low-latency playback (populated by `preloadEchoSounds`). */
const audioBufferCache = new Map<EchoSoundId, AudioBuffer>();
let preloadStarted = false;

/**
 * Fetches and decodes all bundled sounds into memory (idle / background).
 * Call once after app mount; safe to call multiple times.
 */
export function preloadEchoSounds(): void {
  if (typeof window === 'undefined' || preloadStarted) return;
  const ctx = getCtx();
  if (!ctx) return;
  preloadStarted = true;
  void (async () => {
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }
    await Promise.all(
      ECHO_SOUND_IDS.map(async (id) => {
        if (audioBufferCache.has(id)) return;
        try {
          const url = echoSoundUrl(id);
          const res = await fetch(url);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const ab = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(ab.slice(0));
          audioBufferCache.set(id, buf);
          logEchoSoundVerbose('preloaded buffer', {
            id,
            durationSec: buf.duration,
          });
        } catch (e) {
          logEchoSoundWarn('preload decode failed', {
            id,
            sourceFile: ECHO_SOUND_SOURCE_FILES[id],
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }),
    );
  })();
}

/** Short fallback when decode / play fails. */
function playSyntheticForId(id: EchoSoundId, gainScale = 1) {
  const hz = SYNTH_HZ[id] ?? 660;
  const ctx = getCtx();
  if (!ctx) return;
  notifyEchoSoundSyntheticFallback();
  const releaseSession = pushEchoSoundTransientSession();
  const gLinear = Math.max(0, Math.min(2, gainScale));
  const startOsc = () => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = hz;
    g.gain.value = 0.04 * gLinear;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.06);
  };
  const run = async () => {
    try {
      await applyOutputSinkToAudioContext(ctx);
      startOsc();
      window.setTimeout(() => releaseSession(), 250);
    } catch {
      releaseSession();
    }
  };
  if (ctx.state === 'suspended') {
    void ctx.resume().then(() => run().catch(() => {}));
  } else {
    void run().catch(() => {});
  }
}

async function playEchoSoundFromBuffer(
  id: EchoSoundId,
  effectiveGain: number,
): Promise<boolean> {
  const buf = audioBufferCache.get(id);
  const ctx = getCtx();
  if (!buf || !ctx) return false;
  await applyOutputSinkToAudioContext(ctx);
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {});
  }
  const releaseSession = pushEchoSoundTransientSession();
  const src = ctx.createBufferSource();
  const gn = ctx.createGain();
  gn.gain.value = Math.max(0, Math.min(6, effectiveGain));
  src.buffer = buf;
  src.onended = () => releaseSession();
  src.connect(gn);
  gn.connect(ctx.destination);
  src.start(0);
  logEchoSoundVerbose('playing (AudioBuffer)', {
    id,
    sourceFile: ECHO_SOUND_SOURCE_FILES[id],
  });
  return true;
}

/**
 * Plays a bundled Echo UI sound when notification “Sound effects” is enabled.
 * Prefers decoded `AudioBuffer` playback when preloaded; otherwise `HTMLAudioElement`.
 * Falls back to a distinct synthetic tone per `id` if decode / play fails.
 */
export function playEchoSound(
  id: EchoSoundId,
  opts?: { volume?: number; silentFallback?: boolean },
): void {
  const prefs = useNotificationPreferencesStore();
  if (!prefs.settings.soundEffects) return;
  if (prefs.settings.soundEffectsById[id] === false) return;

  void preloadEchoSounds();

  const masterVolume =
    Math.max(0, Math.min(100, prefs.settings.soundEffectsMasterVolume)) / 100;
  const perSoundVolume =
    Math.max(
      0,
      Math.min(100, prefs.settings.soundEffectsVolumeById[id] ?? 100),
    ) / 100;
  const base = opts?.volume ?? 0.7;
  /**
   * Do not scale by voice output / VC level — that slider is for remote voice
   * loudness; tying it here made join/leave and other UI sounds silent for users
   * who turned output down (or to 0) while debugging audio.
   */
  const effectiveGain = Math.max(
    0,
    Math.min(6, base * masterVolume * perSoundVolume),
  );

  const url = echoSoundUrl(id);
  const sourceFile = ECHO_SOUND_SOURCE_FILES[id];
  logEchoSoundVerbose('play', {
    id,
    sourceFile,
    resolvedUrl: url,
    effectiveGain,
    hasBuffer: audioBufferCache.has(id),
  });

  void (async () => {
    try {
      if (isDesktop() && DESKTOP_NATIVE_AUDIO_ENABLED) {
        if (!desktopNativeAudioReady) {
          await initDesktopNativeAudio();
          desktopNativeAudioReady = true;
        }
        let bytes = desktopEchoSoundBytesCache.get(url);
        if (!bytes) {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          bytes = new Uint8Array(await res.arrayBuffer());
          desktopEchoSoundBytesCache.set(url, bytes);
        }
        await playDesktopNativeRingtone({
          audioBytes: bytes,
          looped: false,
          volume01: Math.min(1, effectiveGain),
        });
        return;
      }

      if (await playEchoSoundFromBuffer(id, effectiveGain)) {
        return;
      }

      const el = new Audio();
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      el.src = url;
      const releaseSession = pushEchoSoundTransientSession();
      const endSessionOnMediaDone = () => releaseSession();
      el.addEventListener('ended', endSessionOnMediaDone, { once: true });
      el.addEventListener('error', endSessionOnMediaDone, { once: true });
      el.addEventListener(
        'error',
        () => {
          const err = el.error;
          logEchoSoundWarn('audio element error (before or during play)', {
            id,
            sourceFile,
            resolvedUrl: url,
            mediaErrorCode: err?.code,
            mediaErrorMessage: err?.message,
          });
        },
        { once: true },
      );

      try {
        await applyOutputSink(el);
        if (effectiveGain <= 1) {
          el.volume = effectiveGain;
          await el.play();
          logEchoSoundVerbose('playing (HTMLAudio simple path)', {
            id,
            sourceFile,
          });
          return;
        }
        el.volume = 0;
        const ctx = getCtx();
        if (!ctx) {
          el.volume = Math.min(1, effectiveGain);
          await el.play();
          logEchoSoundVerbose('playing (HTMLAudio no AudioContext)', {
            id,
            sourceFile,
          });
          return;
        }
        await applyOutputSinkToAudioContext(ctx);
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }
        const src = ctx.createMediaElementSource(el);
        const gn = ctx.createGain();
        gn.gain.value = effectiveGain;
        src.connect(gn);
        gn.connect(ctx.destination);
        await el.play();
        logEchoSoundVerbose('playing (HTMLAudio Web Audio gain path)', {
          id,
          sourceFile,
        });
      } catch (playErr) {
        releaseSession();
        throw playErr;
      }
    } catch (e) {
      if (isAudioPlaybackBlockedError(e) && !isAudioPlaybackUnlocked()) {
        whenAudioPlaybackUnlocked(() => {
          playEchoSound(id, {
            volume: opts?.volume,
            silentFallback: opts?.silentFallback,
          });
        });
        return;
      }
      const ctx = getCtx();
      if (ctx?.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          /* ignore */
        }
      }
      logEchoSoundWarn('play failed; using synthetic fallback', {
        id,
        sourceFile,
        resolvedUrl: url,
        error: e instanceof Error ? e.message : String(e),
        silentFallback: !!opts?.silentFallback,
      });
      if (!opts?.silentFallback) {
        playSyntheticForId(id, effectiveGain);
      }
    }
  })();
}

/** Icons for VC-wide announcements (stream / camera), including “stopped” toasts. */
function leadingIconSrcForVcAnnouncement(sound: EchoSoundId): string {
  switch (sound) {
    case 'streamStart':
    case 'streamEnd':
      return icons.desktop;
    case 'videoStart':
      return icons.cameraOn;
    case 'videoEnd':
      return icons.camera;
    default:
      return icons.more;
  }
}

/** LiveKit VC broadcast: toast + sound for everyone in the room (data channel). */
export function announceVoiceChannelPublic(opts: {
  title: string;
  body?: string;
  sound: EchoSoundId;
}): void {
  playEchoSound(opts.sound);
  const prefs = useNotificationPreferencesStore();
  if (prefs.settings.desktopAlerts) {
    dispatchAppToastDetail({
      message: opts.body ? `${opts.title} — ${opts.body}` : opts.title,
      severity: 'info',
      leadingIconSrc: leadingIconSrcForVcAnnouncement(opts.sound),
    });
  }
}
