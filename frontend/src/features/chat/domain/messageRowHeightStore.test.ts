import { describe, expect, it } from 'vitest';
import {
  buildInitialMeasurementsCacheForChannel,
  getCachedMessageRowHeightPx,
  invalidateMessageRowHeight,
  resetMessageRowHeightStoreForTests,
  setMessageRowHeightPx,
} from './messageRowHeightStore';

describe('messageRowHeightStore', () => {
  it('invalidateMessageRowHeight clears cached measurements', () => {
    resetMessageRowHeightStoreForTests();
    setMessageRowHeightPx('c1', 'm1', 120, 'rev1');
    expect(getCachedMessageRowHeightPx('c1', 'm1', 'rev1')).toBe(120);
    invalidateMessageRowHeight('c1', 'm1');
    expect(getCachedMessageRowHeightPx('c1', 'm1', 'rev1')).toBeNull();
  });

  it('does not seed a stale measured height after the row revision changes', () => {
    resetMessageRowHeightStoreForTests();
    setMessageRowHeightPx('c1', 'm1', 40, 'compact-embed');

    const measurements = buildInitialMeasurementsCacheForChannel(
      'c1',
      ['m1'],
      () => 420,
    );

    expect(measurements[0]?.size).toBe(420);
  });

  it('reuses a measured height when the row revision still matches', () => {
    resetMessageRowHeightStoreForTests();
    setMessageRowHeightPx('c1', 'm1', 120, 'same-revision');

    const measurements = buildInitialMeasurementsCacheForChannel(
      'c1',
      ['m1'],
      (index) =>
        getCachedMessageRowHeightPx('c1', ['m1'][index], 'same-revision') ?? 88,
    );

    expect(measurements[0]?.size).toBe(120);
  });
});
