import { fetchWorkspaceSocialForHydrate } from '@/features/layout/echoWorkspace/workspaceSocialHydrate';
import type { EchoDmThreadFromApi } from '@/api/echoClient';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import { dbgMemberList } from '@/features/layout/composables/members/echoMemberListDebug';
import { withTransientFetchRetries } from '@/features/layout/echoWorkspace/retryTransientFetch';
import {
  currentEchoWorkspaceSocialRefreshSeq,
  nextEchoWorkspaceSocialRefreshSeq,
} from '@/features/layout/echoWorkspace/workspaceSocialRefreshSeq';
import { scheduleDeferredTask } from '@/features/layout/failures/scheduleDeferredTask';

export type EchoWorkspaceHydrateSocialParams = {
  token: string;
  userId: string;
  isGuest: boolean;
  workspace: Pick<
    WorkspaceStateApi,
    | 'friendIds'
    | 'friendRequestsIncoming'
    | 'friendRequestsOutgoing'
    | 'messageRequests'
    | 'socialGraphStatus'
  >;
  mergeEchoDmThreadsFromApi?: (threads: EchoDmThreadFromApi[]) => void;
  mergeEchoBlockedFromApi?: (blockedUserIds: string[]) => void;
  syncEchoPresenceFromApi?: () => void;
  isStale?: () => boolean;
};

async function hydrateSocialGraph(
  p: EchoWorkspaceHydrateSocialParams,
): Promise<void> {
  const socialSeq = nextEchoWorkspaceSocialRefreshSeq();
  const social = await withTransientFetchRetries(() =>
    fetchWorkspaceSocialForHydrate(p.token, p.isGuest),
  );
  if (p.isStale?.()) {
    dbgMemberList('hydrateEchoFromApi aborted: auth rotated mid-social', {
      userId: p.userId,
    });
    return;
  }
  if (socialSeq !== currentEchoWorkspaceSocialRefreshSeq()) {
    if (p.workspace.socialGraphStatus.value === 'loading') {
      p.workspace.socialGraphStatus.value = 'ready';
    }
    return;
  }
  p.workspace.friendIds.value = social.friendIds;
  p.workspace.friendRequestsIncoming.value = social.friendRequestsIncoming;
  p.workspace.friendRequestsOutgoing.value = social.friendRequestsOutgoing;
  p.workspace.messageRequests.value = social.messageRequests;
  p.workspace.socialGraphStatus.value = 'ready';
  p.mergeEchoDmThreadsFromApi?.(social.dmThreads);
  p.mergeEchoBlockedFromApi?.(social.blockedUserIds);
  p.syncEchoPresenceFromApi?.();
}

/** When workspace was already loaded, defer social so first history wins the wire. */
export function scheduleOrAwaitWorkspaceSocialHydrate(
  p: EchoWorkspaceHydrateSocialParams,
  opts: { defer: boolean },
): Promise<void> {
  if (!opts.defer) return hydrateSocialGraph(p);
  scheduleDeferredTask(
    () => {
      void hydrateSocialGraph(p).catch(() => {
        p.workspace.socialGraphStatus.value = 'error';
      });
    },
    { timeoutMs: 2500, fallbackDelayMs: 800 },
  );
  return Promise.resolve();
}
