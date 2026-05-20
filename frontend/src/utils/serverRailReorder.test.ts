import { describe, expect, it } from 'vitest';
import {
  railDropBoundariesFromRects,
  railLineBeforeFromBoundaries,
  railLineBeforeFromBoundariesSticky,
  railLineBeforeToToIndex,
  reorderServerRail,
  reorderServerRailWithOverflow,
  projectServerRailVisibleServers,
  MAX_STARRED_SERVERS,
  VISIBLE_SERVER_RAIL_SLOT_COUNT,
} from '@/utils/serverRailReorder';
import type { Server } from '@shared/types';

function S(id: string): Server {
  return { id, name: id, imageUrl: '' };
}

describe('projectServerRailVisibleServers', () => {
  it('puts starred first then MRU non-starred (5 slots max)', () => {
    const all = [S('a'), S('b'), S('c'), S('d'), S('e'), S('f')];
    const pinned = [S('f')];
    const mru = ['e', 'd', 'c', 'b', 'a'];
    const { visible } = projectServerRailVisibleServers(all, pinned, mru);
    expect(visible.map((s) => s.id)).toEqual(['f', 'e', 'd', 'c', 'b']);
  });

  it('caps starred at MAX_STARRED_SERVERS', () => {
    const all = [S('a'), S('b'), S('c'), S('d'), S('e'), S('s1'), S('s2')];
    const pinned = [S('s1'), S('s2'), S('a'), S('b'), S('c')];
    const { visible, starred } = projectServerRailVisibleServers(all, pinned, [
      'e',
    ]);
    expect(starred.length).toBe(MAX_STARRED_SERVERS);
    expect(visible.length).toBe(VISIBLE_SERVER_RAIL_SLOT_COUNT);
    expect(visible.map((s) => s.id)).toEqual(['s1', 's2', 'a', 'b', 'e']);
  });
});

describe('reorderServerRail', () => {
  it('no-ops when from === to', () => {
    const all = [S('a'), S('b'), S('c')];
    const mru = ['a', 'b', 'c'];
    const out = reorderServerRail({
      allServers: all,
      pinnedMore: [],
      mruIds: mru,
      fromIndex: 1,
      toIndex: 1,
    });
    expect(out.servers.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(out.mruIds).toEqual(mru);
  });

  it('reorders MRU fill when nothing pinned', () => {
    const all = [S('a'), S('b'), S('c'), S('d'), S('e'), S('x'), S('y')];
    const mru = ['a', 'b', 'c', 'd', 'e', 'x', 'y'];
    const out = reorderServerRail({
      allServers: all,
      pinnedMore: [],
      mruIds: mru,
      fromIndex: 0,
      toIndex: 1,
    });
    expect(out.servers.map((s) => s.id)).toEqual([
      'b',
      'a',
      'c',
      'd',
      'e',
      'x',
      'y',
    ]);
    expect(out.pinnedMore).toEqual([]);
    expect(out.mruIds.slice(0, 5)).toEqual(['b', 'a', 'c', 'd', 'e']);
  });

  it('no-ops when reorder would cross starred / MRU boundary', () => {
    const all = [S('a'), S('b'), S('c'), S('d'), S('e'), S('f'), S('g')];
    const pinned = [S('f')];
    const mru = ['a', 'b', 'c', 'd', 'e'];
    const out = reorderServerRail({
      allServers: all,
      pinnedMore: pinned,
      mruIds: mru,
      fromIndex: 0,
      toIndex: 2,
    });
    expect(out.servers.map((s) => s.id)).toEqual(all.map((s) => s.id));
    expect(out.pinnedMore.map((s) => s.id)).toEqual(['f']);
    expect(out.mruIds).toEqual(mru);
  });

  it('reorders starred prefix without crossing MRU fill', () => {
    const all = [S('a'), S('b'), S('c'), S('d'), S('e'), S('f'), S('g')];
    const pinned = [S('f'), S('g')];
    const mru = ['a', 'b', 'c', 'd', 'e'];
    const out = reorderServerRail({
      allServers: all,
      pinnedMore: pinned,
      mruIds: mru,
      fromIndex: 0,
      toIndex: 1,
    });
    expect(out.pinnedMore.map((s) => s.id)).toEqual(['g', 'f']);
    expect(out.servers.map((s) => s.id)).toEqual([
      'g',
      'f',
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });
});

describe('reorderServerRailWithOverflow', () => {
  it('promotes overflow server into a visible slot and updates MRU', () => {
    const all = [S('a'), S('b'), S('c'), S('d'), S('e'), S('x')];
    const pinned: Server[] = [];
    const mru = ['a', 'b', 'c', 'd', 'e', 'x'];
    const n = projectServerRailVisibleServers(all, pinned, mru).visible
      .length;
    const out = reorderServerRailWithOverflow({
      allServers: all,
      pinnedMore: pinned,
      mruIds: mru,
      fromIndex: n,
      toIndex: 1,
      overflowServerId: 'x',
    });
    expect(out.servers.map((s) => s.id).slice(0, 5)).toEqual([
      'a',
      'x',
      'b',
      'c',
      'd',
    ]);
    expect(out.mruIds.slice(0, 5)).toEqual(['a', 'x', 'b', 'c', 'd']);
  });

  it('still reorders within visible slice when overflow slot is shown', () => {
    const all = [S('a'), S('b'), S('c'), S('d'), S('e'), S('x')];
    const pinned: Server[] = [];
    const mru = ['a', 'b', 'c', 'd', 'e', 'x'];
    const out = reorderServerRailWithOverflow({
      allServers: all,
      pinnedMore: pinned,
      mruIds: mru,
      fromIndex: 0,
      toIndex: 2,
      overflowServerId: 'x',
    });
    expect(out.servers.map((s) => s.id).slice(0, 5)).toEqual([
      'b',
      'c',
      'a',
      'd',
      'e',
    ]);
  });
});

describe('railLineBeforeToToIndex', () => {
  it('maps gap between B and C when dragging A from the top (user rail DnD)', () => {
    const n = 6;
    const from = 0;
    const lineBefore = 2;
    expect(railLineBeforeToToIndex(from, lineBefore, n)).toBe(1);
  });

  it('clamps lineBefore and matches remove-then-insert semantics', () => {
    expect(railLineBeforeToToIndex(3, 2, 6)).toBe(2);
    expect(railLineBeforeToToIndex(5, 6, 6)).toBe(5);
  });
});

describe('railDropBoundariesFromRects', () => {
  it('builds vertical boundaries without more slot', () => {
    const rects = [
      { top: 0, bottom: 40, left: 0, right: 40 },
      { top: 60, bottom: 100, left: 0, right: 40 },
    ];
    expect(railDropBoundariesFromRects(rects, false, null)).toEqual([
      0, 50, 100,
    ]);
  });

  it('uses midpoint between last server and more control when moreRect is set', () => {
    const rects = [{ top: 0, bottom: 40, left: 0, right: 40 }];
    const more = { top: 80, bottom: 120, left: 0, right: 40 };
    expect(railDropBoundariesFromRects(rects, false, more)).toEqual([0, 60]);
  });

  it('builds horizontal boundaries', () => {
    const rects = [
      { top: 0, bottom: 40, left: 0, right: 40 },
      { top: 0, bottom: 40, left: 60, right: 100 },
    ];
    expect(railDropBoundariesFromRects(rects, true, null)).toEqual([
      0, 50, 100,
    ]);
  });
});

describe('railLineBeforeFromBoundariesSticky', () => {
  const b = [0, 50, 100];

  it('maps position to gap index', () => {
    expect(railLineBeforeFromBoundaries(20, b)).toBe(0);
    expect(railLineBeforeFromBoundaries(60, b)).toBe(1);
    expect(railLineBeforeFromBoundaries(90, b)).toBe(2);
  });

  it('does not flip on small jitter near threshold without deadband clearance', () => {
    const prev = 0;
    const pos = 26;
    const raw = railLineBeforeFromBoundaries(pos, b);
    expect(raw).toBe(1);
    expect(railLineBeforeFromBoundariesSticky(pos, b, prev, 6)).toBe(0);
    expect(railLineBeforeFromBoundariesSticky(31, b, prev, 6)).toBe(1);
  });

  it('jumps more than one gap when pointer moves far', () => {
    expect(railLineBeforeFromBoundariesSticky(90, b, 0, 6)).toBe(2);
  });
});
