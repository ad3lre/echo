import { describe, expect, it } from 'vitest';
import { buildSortedDmGroupFriendsList } from './buildSortedDmGroupFriendsList';

describe('buildSortedDmGroupFriendsList', () => {
  it('returns empty without current user', () => {
    expect(
      buildSortedDmGroupFriendsList({
        currentUserId: undefined,
        users: [{ id: 'a', name: 'A', pfp: '' }],
        friendIds: ['a'],
      }),
    ).toEqual([]);
  });

  it('excludes self and sorts by status', () => {
    const rows = buildSortedDmGroupFriendsList({
      currentUserId: 'me',
      users: [
        { id: 'me', name: 'Me', pfp: '', status: 'online' },
        { id: 'off', name: 'O', pfp: '', status: 'offline' },
        { id: 'on', name: 'N', pfp: '', status: 'online' },
      ],
      friendIds: ['off', 'on'],
    });
    expect(rows.map((r) => r.id)).toEqual(['on', 'off']);
  });
});
