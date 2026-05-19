import { shallowRef, type Ref } from 'vue';
import type { EchoDmThreadFromApi } from '@/api/echoClient';
import type { EchoDmRealtimeThread } from '@shared/types';
import type { useServerStore } from '@/stores/server';
import type { WorkspaceStateApi } from '@/composables/useEchoWorkspace';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { RailTab, DmSubView } from '@/features/layout/mainSurface';
import { logShellNavWithStack } from '@/features/layout/shellNavDebugLog';
import { isEchoGraphId } from '@/utils/echoIds';

function compareNumericStringDesc(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  try {
    const ai = BigInt(a);
    const bi = BigInt(b);
    if (ai === bi) return 0;
    return ai > bi ? -1 : 1;
  } catch {
    return b.localeCompare(a);
  }
}

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
  const echoDmLastActivityIdByChannelId = shallowRef(new Map<string, string>());
  const echoDmActiveCallParticipantUserIdsByChannelId = shallowRef(
    new Map<string, string[]>(),
  );

  function mergeEchoDmThread(
    thread: EchoDmThreadFromApi | EchoDmRealtimeThread,
    overrideLastActivityId?: string,
  ) {
    const m = new Map(echoDmPeerByChannelId.value);
    const s = new Set(echoDmThreadIds.value);
    const a = new Map(echoDmLastActivityIdByChannelId.value);
    const callParticipants = new Map(
      echoDmActiveCallParticipantUserIdsByChannelId.value,
    );
    const nextGroups = { ...groupDMs.value };
    const selfId = authSession.backendUser?.id;
    s.add(thread.channelId);
    const lastActivityId =
      overrideLastActivityId?.trim() ||
      ('lastActivityId' in thread && typeof thread.lastActivityId === 'string'
        ? thread.lastActivityId.trim()
        : '');
    if (lastActivityId) {
      const prev = a.get(thread.channelId) ?? '';
      // Keep activity monotonic so stale hydrate/events cannot move recency backward.
      if (!prev || compareNumericStringDesc(lastActivityId, prev) < 0) {
        a.set(thread.channelId, lastActivityId);
      }
    }
    if ('activeCallParticipantUserIds' in thread) {
      const ids = Array.isArray(thread.activeCallParticipantUserIds)
        ? thread.activeCallParticipantUserIds
            .map((id) => String(id).trim())
            .filter(Boolean)
        : [];
      if (ids.length > 0) callParticipants.set(thread.channelId, ids);
      else callParticipants.delete(thread.channelId);
    }
    if (thread.kind === 'group') {
      const persistedPfp =
        'pfp' in thread && typeof thread.pfp === 'string'
          ? thread.pfp.trim()
          : '';
      const otherId =
        thread.memberUserIds.find((id) => id !== selfId) ??
        thread.memberUserIds[0];
      const u = otherId
        ? workspace.users.value.find((x) => x.id === otherId)
        : undefined;
      nextGroups[thread.channelId] = {
        id: thread.channelId,
        name: thread.name,
        memberIds: thread.memberUserIds,
        pfp: persistedPfp || u?.pfp || '',
      };
    } else if (thread.peerUserId) {
      m.set(thread.channelId, thread.peerUserId);
    }
    groupDMs.value = nextGroups;
    echoDmPeerByChannelId.value = m;
    echoDmThreadIds.value = s;
    echoDmLastActivityIdByChannelId.value = a;
    echoDmActiveCallParticipantUserIdsByChannelId.value = callParticipants;
  }

  /**
   * `/dm/threads` and workspace social `dmThreads` are authoritative snapshots.
   * Drop persisted Echo channel rows that disappeared (leave group, removed, etc.)
   * so the rail and pins fetch do not use stale ids.
   */
  function pruneEchoDmGraphThreadsMissingFromSnapshot(
    incomingChannelIds: ReadonlySet<string>,
  ): void {
    const toRemove: string[] = [];
    for (const ch of echoDmThreadIds.value) {
      if (!isEchoGraphId(ch)) continue;
      if (!incomingChannelIds.has(ch)) toRemove.push(ch);
    }
    if (!toRemove.length) return;
    const m = new Map(echoDmPeerByChannelId.value);
    const s = new Set(echoDmThreadIds.value);
    const a = new Map(echoDmLastActivityIdByChannelId.value);
    const callParticipants = new Map(
      echoDmActiveCallParticipantUserIdsByChannelId.value,
    );
    const nextGroups = { ...groupDMs.value };
    for (const ch of toRemove) {
      m.delete(ch);
      s.delete(ch);
      a.delete(ch);
      callParticipants.delete(ch);
      delete nextGroups[ch];
    }
    echoDmPeerByChannelId.value = m;
    echoDmThreadIds.value = s;
    echoDmLastActivityIdByChannelId.value = a;
    echoDmActiveCallParticipantUserIdsByChannelId.value = callParticipants;
    groupDMs.value = nextGroups;
  }

  function mergeEchoDmThreadsFromApi(threads: EchoDmThreadFromApi[]) {
    const incomingIds = new Set(
      threads
        .map((t) => String(t.channelId).trim())
        .filter((id): id is string => Boolean(id)),
    );
    for (const t of threads) {
      mergeEchoDmThread(t);
    }
    pruneEchoDmGraphThreadsMissingFromSnapshot(incomingIds);
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
    const m = new Map(echoDmPeerByChannelId.value);
    const s = new Set(echoDmThreadIds.value);
    const a = new Map(echoDmLastActivityIdByChannelId.value);
    for (const [ch, peer] of [...m.entries()]) {
      if (peer === peerUserId) {
        m.delete(ch);
        s.delete(ch);
        a.delete(ch);
      }
    }
    echoDmPeerByChannelId.value = m;
    echoDmThreadIds.value = s;
    echoDmLastActivityIdByChannelId.value = a;
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
    echoDmActiveCallParticipantUserIdsByChannelId,
    echoBlockedUserIds,
    mergeEchoDmThreadsFromApi,
    mergeEchoDmThreadFromRealtime,
    mergeEchoBlockedFromApi,
    isEchoUserBlocked,
    stripEchoDmThreadsForPeer,
    leaveDmUiIfViewingUser,
  };
}
