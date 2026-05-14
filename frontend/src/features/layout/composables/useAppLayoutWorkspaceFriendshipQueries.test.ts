import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type { WorkspaceStateApi } from '@/composables/workspace/types';
import { useAppLayoutWorkspaceFriendshipQueries } from './useAppLayoutWorkspaceFriendshipQueries';

function mockWorkspace(partial: {
  friendIds?: string[];
  outgoing?: { id: string; toUserId: string }[];
  incoming?: { id: string; fromUserId: string }[];
}): WorkspaceStateApi {
  return {
    friendIds: ref(partial.friendIds ?? []),
    friendRequestsOutgoing: ref(partial.outgoing ?? []),
    friendRequestsIncoming: ref(partial.incoming ?? []),
  } as unknown as WorkspaceStateApi;
}

describe('useAppLayoutWorkspaceFriendshipQueries', () => {
  it('delegates to workspace friendship state', () => {
    const workspace = mockWorkspace({
      friendIds: ['a'],
      outgoing: [{ id: '1', toUserId: 'b' }],
      incoming: [{ id: '2', fromUserId: 'c' }],
    });
    const q = useAppLayoutWorkspaceFriendshipQueries(workspace);

    expect(q.isEchoUserFriend('a')).toBe(true);
    expect(q.isEchoUserOutgoingFriendRequest('b')).toBe(true);
    expect(q.isEchoUserIncomingFriendRequest('c')).toBe(true);
  });
});
