import { describe, expect, it } from 'vitest';
import { buildSortedInviteableFriendsList } from './buildSortedInviteableFriendsList';

describe('buildSortedInviteableFriendsList', () => {
  it('returns empty without current user', () => {
    expect(
      buildSortedInviteableFriendsList({
        currentUserId: undefined,
        users: [{ id: 'a', name: 'A', pfp: '' }],
        friendIds: ['a'],
        echoPeerByChannelId: new Map(),
        messageKeys: [],
        getMessages: () => undefined,
      }),
    ).toEqual([]);
  });

  it('sorts friends by recent DM activity, then name', () => {
    const rows = buildSortedInviteableFriendsList({
      currentUserId: 'me',
      users: [
        { id: 'me', name: 'Me', pfp: '' },
        { id: 'alpha', name: 'Alpha', pfp: '' },
        { id: 'beta', name: 'Beta', pfp: '' },
        { id: 'gamma', name: 'Gamma', pfp: '' },
      ],
      friendIds: ['alpha', 'beta', 'gamma'],
      echoPeerByChannelId: new Map([
        ['100', 'alpha'],
        ['200', 'beta'],
      ]),
      lastActivityAtMsByChannelId: new Map([
        ['100', 1000],
        ['200', 3000],
      ]),
      messageKeys: ['100', '200', 'dm-gamma'],
      getMessages: (channelId) => {
        if (channelId === 'dm-gamma') {
          return [{ timestamp: '2024-01-02T00:00:00.000Z' }];
        }
        return undefined;
      },
    });

    expect(rows.map((r) => r.id)).toEqual(['gamma', 'beta', 'alpha']);
  });
});
