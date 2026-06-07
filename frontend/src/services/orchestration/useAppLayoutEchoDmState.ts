import { shallowRef, type Ref } from 'vue';
import type { EchoDmThreadFromApi } from '@/api/echoClient';
import type { EchoDmRealtimeThread } from '@shared/types';
import type { useServerStore } from '@/stores/server';
import type { WorkspaceStateApi } from '@/composables/useEchoWorkspace';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { RailTab, DmSubView } from '@/features/layout/mainSurface';
import { logShellNavWithStack } from '@/features/layout/shellNavDebugLog';
import {
  mergeEchoDmThreadIntoRegistry,
  mergeEchoDmThreadSnapshotIntoRegistry,
  removeEchoDmThreadsForPeer,
  type EchoDmThreadRegistryState,
} from '@/services/domain/echoDmThreadRegistry';

export function useAppLayoutEchoDmState(deps: {
  serverStore: ReturnType<typeof useServerStore>;
  workspace: WorkspaceStateApi;
  authSession: ReturnType<typeof useAuthSessionStore>;
  activeChannelId: Ref<string>;
  activeRailTab: Ref<RailTab>;
  dmActiveTab: Ref<DmSubView>;
  selectedDMUserId: Ref<string | null>;
  groupDMs: Ref<
    Record<
      string,
      { id: string; name: string; memberIds: string[]; pfp?: string }
    >
  >;
}) {
  const {
    serverStore,
    workspace,
    authSession,
    activeChannelId,
    activeRailTab,
    dmActiveTab,
    selectedDMUserId,
    groupDMs,
  } = deps;

  /** Persisted Echo 1:1 DM channels (snowflake ids) → peer user id. */
  const echoDmPeerByChannelId = shallowRef(new Map<string, string>());
  const echoDmThreadIds = shallowRef(new Set<string>());
  /**
   * Legacy snowflake-based activity id (kept for backward compatibility with any
   * non-inbox consumer). Inbox ordering MUST NOT use this — use
   * {@link echoDmLastActivityAtMsByChannelId} instead.
   */
  const echoDmLastActivityIdByChannelId = shallowRef(new Map<string, string>());
  /**
   * Authoritative DM inbox sort key per channel id. ms epoch.
   * Sourced from server `lastActivityAt` (ISO) returned by `/dm/threads` and every
   * realtime DM event. Monotonic: stale events cannot reduce the stored value.
   */
  const echoDmLastActivityAtMsByChannelId = shallowRef(
    new Map<string, number>(),
  );
  const echoDmActiveCallParticipantUserIdsByChannelId = shallowRef(
    new Map<string, string[]>(),
  );

  function currentThreadRegistryState(): EchoDmThreadRegistryState {
    return {
      peerByChannelId: echoDmPeerByChannelId.value,
      threadIds: echoDmThreadIds.value,
      lastActivityIdByChannelId: echoDmLastActivityIdByChannelId.value,
      lastActivityAtMsByChannelId: echoDmLastActivityAtMsByChannelId.value,
      activeCallParticipantUserIdsByChannelId:
        echoDmActiveCallParticipantUserIdsByChannelId.value,
      groupDMs: groupDMs.value,
    };
  }

  function applyThreadRegistryState(next: EchoDmThreadRegistryState): void {
    echoDmPeerByChannelId.value = new Map(next.peerByChannelId);
    echoDmThreadIds.value = new Set(next.threadIds);
    echoDmLastActivityIdByChannelId.value = new Map(
      next.lastActivityIdByChannelId,
    );
    echoDmLastActivityAtMsByChannelId.value = new Map(
      next.lastActivityAtMsByChannelId,
    );
    echoDmActiveCallParticipantUserIdsByChannelId.value = new Map(
      next.activeCallParticipantUserIdsByChannelId,
    );
    groupDMs.value = { ...next.groupDMs };
  }

  function mergeEchoDmThread(
    thread: EchoDmThreadFromApi | EchoDmRealtimeThread,
    overrideLastActivityId?: string,
  ) {
    applyThreadRegistryState(
      mergeEchoDmThreadIntoRegistry(currentThreadRegistryState(), thread, {
        overrideLastActivityId,
        selfId: authSession.backendUser?.id,
        users: workspace.users.value,
      }),
    );
  }

  function mergeEchoDmThreadsFromApi(threads: EchoDmThreadFromApi[]) {
    applyThreadRegistryState(
      mergeEchoDmThreadSnapshotIntoRegistry(
        currentThreadRegistryState(),
        threads,
        {
          selfId: authSession.backendUser?.id,
          users: workspace.users.value,
        },
      ),
    );
  }

  function mergeEchoDmThreadFromRealtime(
    thread: EchoDmRealtimeThread,
    lastActivityId?: string,
  ) {
    mergeEchoDmThread(thread, lastActivityId);
  }

  /** Echo API: user ids you have blocked (not used in pure mock mode). */
  const echoBlockedUserIds = shallowRef(new Set<string>());

  function mergeEchoBlockedFromApi(ids: string[]) {
    const normalized = ids.map((x) => String(x).trim()).filter(Boolean);
    echoBlockedUserIds.value = new Set(normalized);
    workspace.blockedUserIds.value = normalized;
  }

  function isEchoUserBlocked(userId: string): boolean {
    if (!userId) return false;
    return echoBlockedUserIds.value.has(userId);
  }

  function stripEchoDmThreadsForPeer(peerUserId: string) {
    applyThreadRegistryState(
      removeEchoDmThreadsForPeer(currentThreadRegistryState(), peerUserId),
    );
  }

  function leaveDmUiIfViewingUser(userId: string) {
    const cid = activeChannelId.value;
    const peerFromMap = echoDmPeerByChannelId.value.get(cid);
    const isLegacyDm = cid === `dm-${userId}`;
    const isEchoDmWithPeer = peerFromMap === userId;
    stripEchoDmThreadsForPeer(userId);
    if (!isLegacyDm && !isEchoDmWithPeer) return;
    selectedDMUserId.value = null;
    logShellNavWithStack(
      'useAppLayoutEchoDmState',
      'leaveDmUiIfViewingUser_to_general',
      { userId, previousChannelId: cid },
    );
    activeChannelId.value = 'general';
    serverStore.selectServer('echo');
    activeRailTab.value = 'dm';
    dmActiveTab.value = 'friends';
  }

  return {
    echoDmPeerByChannelId,
    echoDmThreadIds,
    echoDmLastActivityIdByChannelId,
    echoDmLastActivityAtMsByChannelId,
    echoDmActiveCallParticipantUserIdsByChannelId,
    echoBlockedUserIds,
    mergeEchoDmThreadsFromApi,
    mergeEchoDmThread,
    mergeEchoDmThreadFromRealtime,
    mergeEchoBlockedFromApi,
    isEchoUserBlocked,
    stripEchoDmThreadsForPeer,
    leaveDmUiIfViewingUser,
  };
}
