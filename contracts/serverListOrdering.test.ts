import { describe, expect, it } from 'vitest';
import {
  compareJoinedServerListOrder,
  sortJoinedServerIds,
  touchServerRailMru,
} from './serverListOrdering';

describe('serverListOrdering', () => {
  it('orders pinned, then MRU, then base index', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const sorted = sortJoinedServerIds(ids, {
      pinnedIds: ['c'],
      mruIds: ['d', 'b'],
    });
    expect(sorted).toEqual(['c', 'd', 'b', 'a']);
  });

  it('touchServerRailMru prepends and caps', () => {
    expect(touchServerRailMru(['b', 'c'], 'a', 2)).toEqual(['a', 'b']);
    expect(touchServerRailMru(['a', 'b'], 'a', 8)).toEqual(['a', 'b']);
  });

  it('compare uses base index when unpinned and not in MRU', () => {
    const base = new Map([
      ['x', 0],
      ['y', 1],
    ]);
    expect(
      compareJoinedServerListOrder('x', 'y', {
        pinnedIds: [],
        mruIds: [],
        baseIndexById: base,
      }),
    ).toBeLessThan(0);
  });
});
