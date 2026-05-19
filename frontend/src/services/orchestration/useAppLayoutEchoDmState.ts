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

function parseIsoToMs(value: unknown): number {
  if (typeof value !== 'string' || !value.trim()) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) && t > 0 ? t : 0;
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

  function mergeEchoDmThread(
    thread: EchoDmThreadFromApi | EchoDmRealtimeThread,
    overrideLastActivityId?: string,
  ) {
    const m = new Map(echoDmPeerByChannelId.value);
    const s = new Set(echoDmThreadIds.value);
    const a = new Map(echoDmLastActivityIdByChannelId.value);
    const at = new Map(echoDmLastActivityAtMsByChannelId.value);
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
      if (!prev || compareNumericStringDesc(lastActivityId, prev) < 0) {
        a.set(thread.channelId, lastActivityId);
      }
    }
    const lastActivityAtMs =
      'lastActivityAt' in thread ? parseIsoToMs(thread.lastActivityAt) : 0;
    if (lastActivityAtMs > 0) {
      const prevAt = at.get(thread.channelId) ?? 0;
      if (lastActivityAtMs > prevAt) at.set(thread.channelId, lastActivityAtMs);
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
    echoDmLastActivityAtMsByChannelId.value = at;
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
    const at = new Map(echoDmLastActivityAtMsByChannelId.value);
    const callParticipants = new Map(
      echoDmActiveCallParticipantUserIdsByChannelId.value,
    );
    const nextGroups = { ...groupDMs.value };
    for (const ch of toRemove) {
      m.delete(ch);
      s.delete(ch);
      a.delete(ch);
      at.delete(ch);
      callParticipants.delete(ch);
      delete nextGroups[ch];
    }
    echoDmPeerByChannelId.value = m;
    echoDmThreadIds.value = s;
    echoDmLastActivityIdByChannelId.value = a;
    echoDmLastActivityAtMsByChannelId.value = at;
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
    const at = new Map(echoDmLastActivityAtMsByChannelId.value);
    for (const [ch, peer] of [...m.entries()]) {
      if (peer === peerUserId) {
        m.delete(ch);
        s.delete(ch);
        a.delete(ch);
        at.delete(ch);
      }
    }
    echoDmPeerByChannelId.value = m;
    echoDmThreadIds.value = s;
    echoDmLastActivityIdByChannelId.value = a;
    echoDmLastActivityAtMsByChannelId.value = at;
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
