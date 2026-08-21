import { watch } from 'vue';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import { patchFriendIdsByUserIdMap } from '@/features/layout/echoWorkspace/workspaceFriendIdsByUserId';

/** Keeps `friendIdsByUserId` aligned with `friendIds` + session user (workspace lifecycle). */
export function useWorkspaceFriendIdsByUserIdSync(deps: {
  workspace: WorkspaceStateApi;
  authSession: ReturnType<typeof useAuthSessionStore>;
}) {
  watch(
    () =>
      [
        deps.workspace.friendIds.value,
        deps.authSession.backendUser?.id,
      ] as const,
    ([ids, me]) => {
      deps.workspace.friendIdsByUserId.value = patchFriendIdsByUserIdMap(
        deps.workspace.friendIdsByUserId.value,
        me,
        ids,
      );
    },
    { deep: true, immediate: true },
  );
}
