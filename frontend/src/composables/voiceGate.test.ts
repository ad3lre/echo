import { describe, expect, it } from 'vitest';
import {
  gateMultiplierForDbfs,
  rmsToDbfs,
  thresholdPercentToRms,
} from './voiceGate';

describe('voiceGate', () => {
  it('maps threshold percent into expected RMS range', () => {
    expect(thresholdPercentToRms(0)).toBeCloseTo(0.005, 6);
    expect(thresholdPercentToRms(100)).toBeCloseTo(0.06, 6);
    expect(thresholdPercentToRms(50)).toBeGreaterThan(0.005);
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
