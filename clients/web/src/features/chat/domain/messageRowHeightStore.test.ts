import { describe, expect, it } from 'vitest';
import type { VirtualItem } from '@tanstack/virtual-core';
import {
  buildInitialMeasurementsCacheForChannel,
  getCachedMessageRowHeightPx,
  invalidateMessageRowHeight,
  resetMessageRowHeightStoreForTests,
  setMessageRowHeightPx,
  trySpliceVirtualMeasurementsCache,
} from './messageRowHeightStore';

function itemsFromSizes(
  ids: readonly string[],
  sizes: readonly number[],
): VirtualItem[] {
  const items: VirtualItem[] = [];
  let start = 0;
  for (let i = 0; i < ids.length; i++) {
    const size = sizes[i] ?? 0;
    const end = start + size;
    items.push({
      key: ids[i]!,
      index: i,
      start,
      end,
      size,
      lane: 0,
    });
    start = end;
  }
  return items;
}

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

  it('trySpliceVirtualMeasurementsCache prepends without resizes of stable rows', () => {
    const prevIds = ['a', 'b', 'c'];
    const prev = itemsFromSizes(prevIds, [40, 50, 60]);
    const nextIds = ['x', 'y', 'a', 'b', 'c'];
    const next = trySpliceVirtualMeasurementsCache(
      prevIds,
      nextIds,
      prev,
      (index) => (index === 0 ? 10 : index === 1 ? 20 : 999),
    );
    expect(next).not.toBeNull();
    expect(next!.map((i) => i.key)).toEqual(nextIds);
    expect(next!.map((i) => i.size)).toEqual([10, 20, 40, 50, 60]);
    expect(next![2]!.start).toBe(30);
    expect(next![4]!.end).toBe(180);
  });

  it('trySpliceVirtualMeasurementsCache appends continuing offsets', () => {
    const prevIds = ['a', 'b'];
    const prev = itemsFromSizes(prevIds, [40, 50]);
    const nextIds = ['a', 'b', 'c'];
    const next = trySpliceVirtualMeasurementsCache(
      prevIds,
      nextIds,
      prev,
      () => 70,
    );
    expect(next!.map((i) => i.size)).toEqual([40, 50, 70]);
    expect(next![2]!.start).toBe(90);
    expect(next![2]!.end).toBe(160);
  });

  it('trySpliceVirtualMeasurementsCache drops a start splice (skeleton clear)', () => {
    const prevIds = ['sk0', 'sk1', 'a', 'b'];
    const prev = itemsFromSizes(prevIds, [30, 30, 40, 50]);
    const nextIds = ['a', 'b'];
    const next = trySpliceVirtualMeasurementsCache(
      prevIds,
      nextIds,
      prev,
      () => 999,
    );
    expect(next!.map((i) => i.key)).toEqual(['a', 'b']);
    expect(next!.map((i) => i.size)).toEqual([40, 50]);
    expect(next![0]!.start).toBe(0);
    expect(next![1]!.end).toBe(90);
  });

  it('trySpliceVirtualMeasurementsCache returns null for middle edits', () => {
    const prevIds = ['a', 'b', 'c'];
    const prev = itemsFromSizes(prevIds, [40, 50, 60]);
    expect(
      trySpliceVirtualMeasurementsCache(
        prevIds,
        ['a', 'x', 'c'],
        prev,
        () => 10,
      ),
    ).toBeNull();
  });
});
