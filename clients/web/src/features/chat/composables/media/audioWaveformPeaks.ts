export type WaveformBar = {
  /** Normalized peak amplitude 0..1 */
  peak: number;
  /** 0..1 spectral tint (0 = bass-heavy, 1 = treble-heavy) */
  tint: number;
};

export type WaveformPeaks = {
  bars: WaveformBar[];
  duration: number;
};

export const DEFAULT_WAVEFORM_BAR_COUNT = 128;

/** Minimum visible bar height as a fraction of track height. */
const MIN_BAR_PEAK = 0.1;

/**
 * Downsample decoded audio into mirrored waveform bars with a lightweight
 * bass/treble tint proxy (SoundCloud-style, not a full spectrogram).
 */
export function extractWaveformPeaks(
  buffer: AudioBuffer,
  barCount = DEFAULT_WAVEFORM_BAR_COUNT,
): WaveformPeaks {
  const count = Math.max(16, Math.min(512, Math.floor(barCount)));
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const len = left.length;
  const blockSize = Math.max(1, Math.floor(len / count));

  const raw: { peak: number; bass: number; treble: number }[] = [];
  let globalMax = 0;

  for (let b = 0; b < count; b++) {
    const start = b * blockSize;
    const end = Math.min(len, start + blockSize);
    let peak = 0;
    let bass = 0;
    let treble = 0;
    let prev =
      start > 0
        ? sampleAt(left, right, start - 1)
        : sampleAt(left, right, start);

    for (let i = start; i < end; i++) {
      const s = sampleAt(left, right, i);
      const abs = Math.abs(s);
      if (abs > peak) peak = abs;
      bass += abs;
      treble += Math.abs(s - prev);
      prev = s;
    }

    const n = Math.max(1, end - start);
    raw.push({ peak, bass: bass / n, treble: treble / n });
    if (peak > globalMax) globalMax = peak;
  }

  const scale = globalMax > 1e-6 ? 1 / globalMax : 1;
  const bars: WaveformBar[] = raw.map((r) => {
    const peak = Math.min(1, r.peak * scale);
    const bass = r.bass * scale;
    const treble = r.treble * scale * 2.5;
    const tintDenom = bass + treble + 1e-6;
    const tint = Math.min(1, Math.max(0, treble / tintDenom));
    return {
      peak: Math.max(MIN_BAR_PEAK, peak),
      tint,
    };
  });

  return { bars, duration: buffer.duration };
}

function sampleAt(
  left: Float32Array,
  right: Float32Array | null,
  index: number,
): number {
  const l = left[index] ?? 0;
  if (!right) return l;
  return (l + (right[index] ?? 0)) * 0.5;
}
