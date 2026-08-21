import type { Ref } from 'vue';
import { fetchEchoUserProfileDetail } from '@/api/echo/social';
import {
  mergeEchoUserProfileDetailIntoWorkspaceUsers,
  workspaceUserHasProfileDetail,
} from '@/features/dm/mergeEchoUserProfileDetailIntoWorkspace';
import type { WorkspaceRosterUserRow } from '@/features/layout/echoWorkspace/workspaceRoster';
import { reportPrimaryFlowFailure } from '@/features/layout/failures/primaryFlowFailure';

const inflight = new Map<string, Promise<void>>();

export function createGuildMemberProfileDetailHydrator(deps: {
  getToken: () => string;
  users: Ref<readonly WorkspaceRosterUserRow[]>;
  canFetch: () => boolean;
}) {
  return async function ensureGuildMemberProfileDetailHydrated(
    userId: string,
  ): Promise<boolean> {
    const id = userId.trim();
    if (!id || !deps.canFetch()) return false;

    const existingUser = deps.users.value.find((u) => u.id === id);
    if (workspaceUserHasProfileDetail(existingUser)) return true;

    const pending = inflight.get(id);
    if (pending) {
      await pending;
      return workspaceUserHasProfileDetail(
        deps.users.value.find((u) => u.id === id),
      );
    }

    const job = (async () => {
      try {
        const token = deps.getToken().trim();
        if (!token) return;
        const profile = await fetchEchoUserProfileDetail(token, id);
        const merged = mergeEchoUserProfileDetailIntoWorkspaceUsers(
          deps.users.value,
          profile,
        );
        (deps.users as Ref<WorkspaceRosterUserRow[]>).value = merged;
      } catch (e) {
        reportPrimaryFlowFailure('fetchEchoUserProfileDetail', e, {
          peerUserId: id,
        });
      } finally {
        inflight.delete(id);
      }
    })();

    inflight.set(id, job);
    await job;
    return workspaceUserHasProfileDetail(
      deps.users.value.find((u) => u.id === id),
    );
  };
}

/** Test-only reset for in-flight dedupe map. */
export function resetGuildMemberProfileDetailHydrationForTests(): void {
  inflight.clear();
}
