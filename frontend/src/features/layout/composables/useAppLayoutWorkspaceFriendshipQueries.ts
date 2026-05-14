import type { WorkspaceStateApi } from '@/composables/workspace/types';
import { createWorkspaceFriendshipQueries } from '@/features/dm/workspaceFriendshipQueries';

/** Friendship predicates for shell/profile over workspace social refs. */
export function useAppLayoutWorkspaceFriendshipQueries(
  workspace: WorkspaceStateApi,
) {
  return createWorkspaceFriendshipQueries({
    friendIds: () => workspace.friendIds.value,
    friendRequestsOutgoing: () => workspace.friendRequestsOutgoing.value,
    friendRequestsIncoming: () => workspace.friendRequestsIncoming.value,
  });
}
