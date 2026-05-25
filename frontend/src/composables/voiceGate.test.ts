import { describe, expect, it } from 'vitest';
import {
  createRemoteSpeakingTracker,
  gateMultiplierForDbfs,
  indicatorReleaseRmsFromOn,
  indicatorRmsFromGatePercent,
  mergeSpeakingMapIfChanged,
  rmsToDbfs,
  thresholdPercentToRms,
} from './voiceGate';

describe('voiceGate', () => {
  it('maps threshold percent into expected RMS range', () => {
    expect(thresholdPercentToRms(0)).toBeCloseTo(0.005, 6);
    expect(thresholdPercentToRms(100)).toBeCloseTo(0.06, 6);
    expect(thresholdPercentToRms(50)).toBeGreaterThan(0.005);
  });

  it('indicator threshold is more sensitive than the outbound gate', () => {
    const gate = thresholdPercentToRms(24);
    const indicator = indicatorRmsFromGatePercent(24);
    expect(indicator).toBeLessThan(gate);
    expect(indicator).toBeGreaterThanOrEqual(0.004);
  });

  it('release threshold sits below the on threshold for hysteresis', () => {
    const on = indicatorRmsFromGatePercent(30);
    const off = indicatorReleaseRmsFromOn(on);
    expect(off).toBeLessThan(on);
  });

  it('remote speaking tracker holds briefly after level drops', () => {
    const tracker = createRemoteSpeakingTracker();
    const on = indicatorRmsFromGatePercent(24);
    const off = indicatorReleaseRmsFromOn(on);
    let now = 1_000;
    expect(tracker.speakingFor('u1', on + 0.002, false, on, off, now)).toBe(
      true,
    );
    expect(tracker.speakingFor('u1', off - 0.001, false, on, off, now)).toBe(
      true,
    );
    now += 50;
    expect(tracker.speakingFor('u1', off - 0.001, false, on, off, now)).toBe(
      true,
    );
    now += 200;
    expect(tracker.speakingFor('u1', off - 0.001, false, on, off, now)).toBe(
      false,
    );
  });

  it('mergeSpeakingMapIfChanged avoids object churn when unchanged', () => {
    const current = {
      a: { level: 0.2, speaking: true },
      b: { level: 0.05, speaking: false },
    };
    const same = {
      a: { level: 0.201, speaking: true },
      b: { level: 0.049, speaking: false },
    };
    expect(mergeSpeakingMapIfChanged(current, same)).toBe(current);
    const changed = {
      ...same,
      b: { level: 0.049, speaking: true },
    };
    expect(mergeSpeakingMapIfChanged(current, changed)).toBe(changed);
  });

  it('converts rms to dbfs with floor/ceiling', () => {
    expect(rmsToDbfs(1)).toBeCloseTo(0, 6);
    expect(rmsToDbfs(0)).toBe(-100);
    expect(rmsToDbfs(1e-10)).toBe(-100);
  });

  it('hard gate mutes below threshold', () => {
    const m = gateMultiplierForDbfs(-80, 30, 'hard');
    expect(m).toBe(0);
  });

  it('soft gate attenuates below threshold but does not hard-mute', () => {
    const m = gateMultiplierForDbfs(-80, 30, 'soft');
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(1);
  });

  it('returns full gain above threshold for both modes', () => {
    expect(gateMultiplierForDbfs(-5, 30, 'hard')).toBe(1);
    expect(gateMultiplierForDbfs(-5, 30, 'soft')).toBe(1);
  });

  it('none mode always passes full gain', () => {
    expect(gateMultiplierForDbfs(-90, 80, 'none')).toBe(1);
  });
});
