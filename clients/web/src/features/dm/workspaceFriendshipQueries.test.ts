import { describe, expect, it } from 'vitest';
import { createWorkspaceFriendshipQueries } from './workspaceFriendshipQueries';

describe('createWorkspaceFriendshipQueries', () => {
  const q = createWorkspaceFriendshipQueries({
    friendIds: () => ['a', 'b'],
    friendRequestsOutgoing: () => [{ toUserId: 'x' }],
    friendRequestsIncoming: () => [{ fromUserId: 'y' }],
  });

  it('detects friend', () => {
    expect(q.isEchoUserFriend('a')).toBe(true);
    expect(q.isEchoUserFriend('z')).toBe(false);
  });

  it('detects outgoing request', () => {
    expect(q.isEchoUserOutgoingFriendRequest('x')).toBe(true);
  });

  it('detects incoming request', () => {
    expect(q.isEchoUserIncomingFriendRequest('y')).toBe(true);
  });
});
