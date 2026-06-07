import { ref, readonly, onUnmounted } from 'vue';
import {
  indicatorReleaseRmsFromOn,
  indicatorRmsFromGatePercent,
  SPEAKING_INDICATOR_RMS_FLOOR,
  SPEAKING_INDICATOR_SILENCE_HOLD_MS,
} from '@/composables/voiceGate';
import {
  isVoiceClientVerbose,
  voiceClientDiag,
} from '@/observability/voiceClientTrace';

export interface AudioLevelState {
  /** Normalized 0–1 RMS level of the audio signal. */
  level: number;
  /** Signal level in dBFS (typically -100..0). */
  dbfs: number;
  /** Whether the level exceeds the speaking threshold. */
  speaking: boolean;
}

/** Default matches ~24% gate slider via {@link indicatorRmsFromGatePercent}. */
const DEFAULT_SPEAKING_THRESHOLD = indicatorRmsFromGatePercent(24);
/** Scale quiet speech into a visible ring strength (lower divisor = more sensitive UI). */
const LEVEL_NORMALIZE_RMS = 0.18;

/**
 * Monitors audio levels from a MediaStream via a Web Audio AnalyserNode.
 * Exposes a reactive `level` (0–1) and `speaking` boolean for green-ring indicators.
 */
export function useAudioLevelMonitor() {
  const level = ref(0);
  const dbfs = ref(-100);
  const speaking = ref(false);
  const audioContextState = ref<AudioContextState | 'none'>('none');
  const audioContextSampleRate = ref(0);

  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let rafId: number | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let dataArray: Float32Array<ArrayBuffer> | null = null;
  let speakingThreshold = DEFAULT_SPEAKING_THRESHOLD;
  let speakingReleaseThreshold = indicatorReleaseRmsFromOn(
    DEFAULT_SPEAKING_THRESHOLD,
  );

  function computeRms(buf: Float32Array<ArrayBuffer>): number {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      sum += buf[i]! * buf[i]!;
    }
    return Math.sqrt(sum / buf.length);
  }

  async function ensureAudioContextRunning(): Promise<void> {
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        /* gesture / autoplay policy */
      }
    }
    audioContextState.value = ctx.state;
  }

  function tick() {
    if (!analyser || !dataArray) return;
    if (ctx?.state === 'suspended') {
      void ensureAudioContextRunning();
    }
    analyser.getFloatTimeDomainData(dataArray);
    const rms = computeRms(dataArray);
    const db = rms > 1e-7 ? 20 * Math.log10(rms) : -100;

    level.value = Math.min(1, rms / LEVEL_NORMALIZE_RMS);
    dbfs.value = Math.max(-100, Math.min(0, db));

    if (rms >= speakingThreshold) {
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
      speaking.value = true;
    } else if (
      speaking.value &&
      rms < speakingReleaseThreshold &&
      !silenceTimer
    ) {
      silenceTimer = setTimeout(() => {
        speaking.value = false;
        silenceTimer = null;
      }, SPEAKING_INDICATOR_SILENCE_HOLD_MS);
    } else if (
      speaking.value &&
      rms >= speakingReleaseThreshold &&
      silenceTimer
    ) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }

    rafId = requestAnimationFrame(tick);
  }

  function attachStream(stream: MediaStream) {
    stop();
    ctx = new AudioContext();
    audioContextState.value = ctx.state;
    audioContextSampleRate.value = ctx.sampleRate;
    ctx.onstatechange = () => {
      if (!ctx) return;
      audioContextState.value = ctx.state;
    };
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    dataArray = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

    source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);

    void ensureAudioContextRunning();

    if (ctx.state !== 'running') {
      voiceClientDiag('warn', 'voice.client:audio_ctx_not_running', {
        state: ctx.state,
        sampleRate: ctx.sampleRate,
        audioTracks: stream.getAudioTracks().map((t) => ({
          label: t.label,
          enabled: t.enabled,
          muted: t.muted === true,
          readyState: t.readyState,
        })),
      });
    } else if (isVoiceClientVerbose()) {
      voiceClientDiag('debug', 'voice.client:audio_ctx_running', {
        sampleRate: ctx.sampleRate,
      });
    }

    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    if (source) {
      source.disconnect();
      source = null;
    }
    if (ctx) {
      void ctx.close().catch(() => {});
      ctx = null;
    }
    analyser = null;
    dataArray = null;
    level.value = 0;
    dbfs.value = -100;
    speaking.value = false;
    audioContextState.value = 'none';
    audioContextSampleRate.value = 0;
  }

  function setSpeakingThreshold(next: number) {
    // RMS threshold in normalized domain (0..1) for the UI speaking ring.
    speakingThreshold = Math.max(
      SPEAKING_INDICATOR_RMS_FLOOR,
      Math.min(1, next),
    );
    speakingReleaseThreshold = indicatorReleaseRmsFromOn(speakingThreshold);
  }

  onUnmounted(stop);

  return {
    level: readonly(level),
    dbfs: readonly(dbfs),
    speaking: readonly(speaking),
    audioContextState: readonly(audioContextState),
    audioContextSampleRate: readonly(audioContextSampleRate),
    attachStream,
    stop,
    setSpeakingThreshold,
    ensureAudioContextRunning,
  };
}

/**
 * Lightweight per-participant speaking state tracked outside of Vue reactivity
 * for remote participants (driven by LiveKit's active-speaker events).
 */
export function createSpeakingMap() {
  const map = ref<Record<string, AudioLevelState>>({});

  function set(participantId: string, state: AudioLevelState) {
    map.value = {
      ...map.value,
      [participantId]: state,
    };
  }

  function remove(participantId: string) {
    const copy = { ...map.value };
    delete copy[participantId];
    map.value = copy;
  }

  function clear() {
    map.value = {};
  }

  return { map: readonly(map), set, remove, clear };
}
