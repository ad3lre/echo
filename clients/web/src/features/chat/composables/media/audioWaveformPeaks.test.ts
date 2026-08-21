import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WAVEFORM_BAR_COUNT,
  extractWaveformPeaks,
} from './audioWaveformPeaks';

function mockAudioBuffer(
  samples: Float32Array,
  sampleRate = 44100,
  channels = 1,
): AudioBuffer {
  const channelData =
    channels === 1
      ? [samples]
      : [samples, new Float32Array(samples.length).fill(0)];
  return {
    numberOfChannels: channels,
    length: samples.length,
    sampleRate,
    duration: samples.length / sampleRate,
    getChannelData: (i: number) => channelData[i]!,
  } as AudioBuffer;
}

describe('extractWaveformPeaks', () => {
  it('returns the requested bar count', () => {
    const samples = new Float32Array(4096);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(i / 12) * 0.5;
    }
    const peaks = extractWaveformPeaks(mockAudioBuffer(samples), 64);
    expect(peaks.bars).toHaveLength(64);
    expect(peaks.duration).toBeCloseTo(4096 / 44100, 4);
  });

  it('normalizes louder segments higher than silence', () => {
    const samples = new Float32Array(512);
    for (let i = 256; i < 512; i++) {
      samples[i] = 0.9;
    }
    const peaks = extractWaveformPeaks(mockAudioBuffer(samples), 32);
    const firstHalfMax = Math.max(
      ...peaks.bars.slice(0, 16).map((b) => b.peak),
    );
    const secondHalfMax = Math.max(...peaks.bars.slice(16).map((b) => b.peak));
    expect(secondHalfMax).toBeGreaterThan(firstHalfMax);
  });

  it('clamps peaks to a visible minimum', () => {
    const peaks = extractWaveformPeaks(
      mockAudioBuffer(new Float32Array(256)),
      16,
    );
    for (const bar of peaks.bars) {
      expect(bar.peak).toBeGreaterThanOrEqual(0.1);
      expect(bar.tint).toBeGreaterThanOrEqual(0);
      expect(bar.tint).toBeLessThanOrEqual(1);
    }
  });

  it('defaults to the standard bar count', () => {
    const samples = new Float32Array(8192);
    const peaks = extractWaveformPeaks(mockAudioBuffer(samples));
    expect(peaks.bars).toHaveLength(DEFAULT_WAVEFORM_BAR_COUNT);
  });
});
