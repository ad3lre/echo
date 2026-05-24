import { onUnmounted, ref, watch, type Ref } from 'vue';
import {
  DEFAULT_WAVEFORM_BAR_COUNT,
  extractWaveformPeaks,
  type WaveformPeaks,
} from './audioWaveformPeaks';

const peaksCache = new Map<string, WaveformPeaks>();
const inflight = new Map<string, Promise<WaveformPeaks | null>>();

const MAX_DECODE_BYTES = 24 * 1024 * 1024;

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const win = window as Window & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

async function decodePeaksFromUrl(url: string): Promise<WaveformPeaks | null> {
  const cached = peaksCache.get(url);
  if (cached) return cached;

  const pending = inflight.get(url);
  if (pending) return pending;

  const task = (async () => {
    const Ctx = getAudioContextCtor();
    if (!Ctx) return null;

    const res = await fetch(url);
    if (!res.ok) return null;

    const lenHeader = res.headers.get('content-length');
    if (lenHeader) {
      const bytes = Number(lenHeader);
      if (Number.isFinite(bytes) && bytes > MAX_DECODE_BYTES) return null;
    }

    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_DECODE_BYTES) return null;

    const ctx = new Ctx();
    try {
      const buffer = await ctx.decodeAudioData(ab.slice(0));
      const peaks = extractWaveformPeaks(buffer, DEFAULT_WAVEFORM_BAR_COUNT);
      peaksCache.set(url, peaks);
      return peaks;
    } finally {
      void ctx.close().catch(() => {});
    }
  })();

  inflight.set(url, task);
  try {
    return await task;
  } finally {
    inflight.delete(url);
  }
}

export function useAudioWaveformPeaks(url: Ref<string>) {
  const peaks = ref<WaveformPeaks | null>(null);
  const loading = ref(false);
  const failed = ref(false);

  let generation = 0;

  async function load(nextUrl: string): Promise<void> {
    generation += 1;
    const gen = generation;

    peaks.value = peaksCache.get(nextUrl) ?? null;
    failed.value = false;

    if (!nextUrl.trim()) {
      loading.value = false;
      peaks.value = null;
      return;
    }

    if (peaks.value) {
      loading.value = false;
      return;
    }

    loading.value = true;
    try {
      const decoded = await decodePeaksFromUrl(nextUrl);
      if (gen !== generation) return;
      if (decoded) {
        peaks.value = decoded;
        failed.value = false;
      } else {
        peaks.value = null;
        failed.value = true;
      }
    } catch {
      if (gen !== generation) return;
      peaks.value = null;
      failed.value = true;
    } finally {
      if (gen === generation) loading.value = false;
    }
  }

  watch(url, (next) => void load(next), { immediate: true });

  onUnmounted(() => {
    generation += 1;
  });

  return { peaks, loading, failed };
}

/** @internal test helper */
export function __clearWaveformPeaksCacheForTests(): void {
  peaksCache.clear();
  inflight.clear();
}
