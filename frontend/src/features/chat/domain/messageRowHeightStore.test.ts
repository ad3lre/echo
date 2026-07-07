import { describe, expect, it } from 'vitest';
import {
  buildInitialMeasurementsCacheForChannel,
  getCachedMessageRowHeightPx,
  resetMessageRowHeightStoreForTests,
  setMessageRowHeightPx,
} from './messageRowHeightStore';

describe('messageRowHeightStore', () => {
  it('returns cached height only when revision matches', () => {
    resetMessageRowHeightStoreForTests();
    setMessageRowHeightPx('ch1', 'm1', 120, 'rev-a');
    expect(getCachedMessageRowHeightPx('ch1', 'm1', 'rev-a')).toBe(120);
    expect(getCachedMessageRowHeightPx('ch1', 'm1', 'rev-b')).toBeNull();
  });

  it('builds initial measurements from cached heights', () => {
    resetMessageRowHeightStoreForTests();
    setMessageRowHeightPx('ch1', 'm1', 100, 'r1');
    setMessageRowHeightPx('ch1', 'm2', 140, 'r2');
    const cache = buildInitialMeasurementsCacheForChannel(
      'ch1',
      ['m1', 'm2'],
      () => 88,
    );
    expect(cache).toHaveLength(2);
    expect(cache[0]?.size).toBe(100);
    expect(cache[1]?.size).toBe(140);
    expect(cache[1]?.start).toBe(100);
  });
});
