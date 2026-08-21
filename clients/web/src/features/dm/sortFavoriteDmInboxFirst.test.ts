import { describe, expect, it } from 'vitest';
import type { DmPanelInboxEntry } from '@/features/dm/buildDmPanelUserList';
import { sortFavoriteDmInboxFirst } from '@/features/dm/sortFavoriteDmInboxFirst';

describe('sortFavoriteDmInboxFirst', () => {
  it('places favorites first, preserving order within each block', () => {
    const entries: DmPanelInboxEntry[] = [
      { kind: 'user', id: 'a', name: 'A', pfp: '' },
      { kind: 'user', id: 'b', name: 'B', pfp: '' },
      { kind: 'group', id: 'g1', name: 'G1', pfp: '' },
      { kind: 'user', id: 'c', name: 'C', pfp: '' },
    ];
    const favUsers = new Set(['b', 'c']);
    const sorted = sortFavoriteDmInboxFirst(entries, {
      isUserFavorite: (id) => favUsers.has(id),
      isGroupFavorite: () => false,
    });
    expect(sorted.map((e) => e.id)).toEqual(['b', 'c', 'a', 'g1']);
  });

  it('includes group favorites in the top block', () => {
    const entries: DmPanelInboxEntry[] = [
      { kind: 'user', id: 'u1', name: 'U', pfp: '' },
      { kind: 'group', id: 'gx', name: 'GX', pfp: '' },
    ];
    const sorted = sortFavoriteDmInboxFirst(entries, {
      isUserFavorite: () => false,
      isGroupFavorite: (id) => id === 'gx',
    });
    expect(sorted.map((e) => e.id)).toEqual(['gx', 'u1']);
  });
});
