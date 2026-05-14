import { watch, onScopeDispose, type Ref } from 'vue';
import { fetchEchoPresenceBatch } from '@/api/echoClient';
import type { EchoWorkspaceState } from '@/api/echoClient';
import { useEchoSessionStore } from '@/stores/echoSession';
import type { useServerStore } from '@/stores/server';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { WorkspaceStateApi } from '@/composables/workspace/types';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import { scheduleDeferredTask } from '@/utils/scheduleDeferredTask';
import {
  isTransientPresenceFetchError,
  isValidEchoPresenceStatus,
} from '@/features/layout/workspace/echoPresence';
import { globalAuthorIds } from '@/features/chat/domain/channelMessageIndex';
import { collectPresenceCandidateUserIds } from '@/services/domain/presenceScope';
import type { EchoWorkspacePresencePatch } from '@/services/domain/workspaceSession';

type WorkspaceMembersByServerRef = Ref<
  NonNullable<EchoWorkspaceState['membersByServer']>
>;

export function useEchoPresenceSync(deps: {
  serverStore: ReturnType<typeof useServerStore>;
  authSession: ReturnType<typeof useAuthSessionStore>;
  workspace: WorkspaceStateApi;
  /** Roster fallback when `workspace.serverMemberIds` is empty for the selected server. */
  workspaceMembersByServer: WorkspaceMembersByServerRef;
}) {
  const { serverStore, authSession, workspace, workspaceMembersByServer } =
    deps;
  const echoSession = useEchoSessionStore();

  function syncEchoPresenceFromApi() {
    if (!authSession.isAuthenticated) return;
    const token = authSession.accessToken?.trim() ?? '';
    const ids = collectPresenceCandidateUserIds({
      authUserId: authSession.backendUser?.id,
      workspaceUserIds: workspace.users.value.map((u) => u.id),
      friendIds: workspace.friendIds.value ?? [],
      globalAuthorIds,
      selectedServerId: serverStore.selectedServerId,
      serverMemberIdsByServer: workspace.serverMemberIds.value,
      workspaceMembersByServer: workspaceMembersByServer.value,
    });
    if (!ids.length) return;
    void fetchEchoPresenceBatch(token, ids)
      .then((batch) => {
        const patches: EchoWorkspacePresencePatch[] = [];
        for (const [uid, status] of Object.entries(batch.presence)) {
          if (!isValidEchoPresenceStatus(status)) continue;
          const mobile = batch.presenceClient[uid] === 'mobile';
          patches.push({
            userId: uid,
            status,
            mobileSurface: mobile,
          });
        }
        if (patches.length > 0) {
          echoSession.patchPresenceBatch(patches);
        }
        // Update last online timestamps
        if (batch.lastOnlineAt) {
          echoSession.patchLastOnlineBatch(
            Object.entries(batch.lastOnlineAt).map(([userId, timestamp]) => ({
              userId,
              lastOnlineAt: timestamp,
            })),
          );
        }
      })
      .catch((e) => {
        if (isTransientPresenceFetchError(e)) {
          return;
        }
        reportPrimaryFlowFailure('syncEchoPresenceFromApi', e, {
          idCount: ids.length,
        });
      });
  }

  let deferredServerPresenceSync: ReturnType<
    typeof scheduleDeferredTask
  > | null = null;

  function scheduleServerPresenceSync() {
    deferredServerPresenceSync?.cancel();
    deferredServerPresenceSync = scheduleDeferredTask(
      () => {
        deferredServerPresenceSync = null;
        syncEchoPresenceFromApi();
      },
      {
        timeoutMs: 2500,
        fallbackDelayMs: 900,
      },
    );
  }

  watch(
    () => serverStore.selectedServerId,
    (selectedServerId) => {
      deferredServerPresenceSync?.cancel();
      deferredServerPresenceSync = null;
      if (!authSession.isAuthenticated || !selectedServerId) return;
      scheduleServerPresenceSync();
    },
  );

  onScopeDispose(() => {
    deferredServerPresenceSync?.cancel();
  });

  function applyEchoPresenceFromSocket(p: {
    userId: string;
    status: string;
    activeClient?: 'mobile' | 'web';
  }) {
    if (!isValidEchoPresenceStatus(p.status)) return;
    if (p.activeClient === undefined) {
      echoSession.patchPresence(p.userId, p.status);
      return;
    }
    echoSession.patchPresence(p.userId, p.status, {
      mobileSurface: p.activeClient === 'mobile',
    });
  }

  return { syncEchoPresenceFromApi, applyEchoPresenceFromSocket };
}
