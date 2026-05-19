import { describe, expect, it } from 'vitest';
import { selectFriendshipUiState } from '../friendshipUi';

const base = {
  guestFriendsLocked: false,
  targetIsDiscordShadow: false,
  blockedUserIds: [] as string[],
  friendRequestsIncoming: [] as { fromUserId: string }[],
  friendRequestsOutgoing: [] as { toUserId: string }[],
};

describe('selectFriendshipUiState', () => {
  it('does not offer Add friend when the graph is not known', () => {
    const ui = selectFriendshipUiState({
      ...base,
      viewerUserId: 'me',
      targetUserId: 'them',
      friendshipKnown: false,
      friendIds: [],
    });
    expect(ui.primaryLabel).toBe('Checking…');
    expect(ui.primaryIntent).toBe(null);
    expect(ui.primaryEnabled).toBe(false);
  });

  it('treats peer as friend when id only appears in viewerFriendIdsFromMap', () => {
    const ui = selectFriendshipUiState({
      ...base,
      viewerUserId: 'me',
      targetUserId: 'them',
      friendshipKnown: true,
      friendIds: [],
      viewerFriendIdsFromMap: ['them'],
    });
    expect(ui.kind).toBe('friend');
    expect(ui.primaryLabel).toBe('Friends');
  });

  it('matches friend / block / request ids with surrounding whitespace', () => {
    expect(
      selectFriendshipUiState({
        ...base,
        viewerUserId: ' me ',
        targetUserId: 'them',
        friendshipKnown: true,
        friendIds: [' them '],
      }).kind,
    ).toBe('friend');

    expect(
      selectFriendshipUiState({
        ...base,
        viewerUserId: 'me',
        targetUserId: 'them',
        friendshipKnown: true,
        friendIds: [],
        blockedUserIds: [' them '],
      }).kind,
    ).toBe('blocked');

    expect(
      selectFriendshipUiState({
        ...base,
        viewerUserId: 'me',
        targetUserId: 'them',
        friendshipKnown: true,
        friendIds: [],
        friendRequestsIncoming: [{ fromUserId: ' them ' }],
      }).kind,
    ).toBe('incoming_request');
  });
});
