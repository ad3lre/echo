import { computed, type ComputedRef, type Ref } from 'vue';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import { useDmAttentionUnreadMapForPanelComputed } from './useDmAttentionUnreadMapForPanelComputed';
import { createLatestDmInboxTargetForRailResolver } from '@/features/dm/createLatestDmInboxTargetForRailResolver';

type GroupDmRow = {
  id: string;
  name: string;
  memberIds: string[];
  pfp?: string;
};

type LatestInboxTarget =
  | { kind: 'user'; userId: string }
  | { kind: 'group'; channelId: string };

export type UseAppLayoutDmRailUnreadInputsDeps = {
  workspace: WorkspaceStateApi;
  authSession: ReturnType<typeof useAuthSessionStore>;
  dmAttentionByChannelId: Parameters<
    typeof useDmAttentionUnreadMapForPanelComputed
  >[0]['dmAttentionByChannelId'];
  readStateByChannelId: Parameters<
    typeof useDmAttentionUnreadMapForPanelComputed
  >[0]['readStateByChannelId'];
  currentUserIdForSocket: Ref<string | undefined>;
  isKnownDmChannelId: (channelId: string) => boolean;
  groupDMs: Ref<Record<string, GroupDmRow>>;
  echoDmPeerByChannelId: Ref<Map<string, string>>;
  echoDmLastActivityAtMsByChannelId: Ref<Map<string, number>>;
  echoDmActiveCallParticipantUserIdsByChannelId: Ref<Map<string, string[]>>;
  selectedDMUserId: Ref<string | null>;
  activeChannelId: Ref<string>;
  dmCallWithUserId: Ref<string | null>;
  hiddenDmInboxStore: {
    isUserHidden: (userId: string) => boolean;
    isGroupHidden: (channelId: string) => boolean;
  };
  favoriteDmInboxStore: {
    isUserFavorite: (userId: string) => boolean;
    isGroupFavorite: (channelId: string) => boolean;
  };
  getLatestDmInboxTargetForRailRef: Ref<() => LatestInboxTarget | null>;
};

export function useDmRailActiveCallUserIds(deps: {
  authSession: { backendUser?: { id?: string } | null };
  dmCallWithUserId: Ref<string | null>;
  groupDMs: Ref<Record<string, unknown>>;
  echoDmActiveCallParticipantUserIdsByChannelId: Ref<Map<string, string[]>>;
  echoDmPeerByChannelId: Ref<Map<string, string>>;
}): ComputedRef<Set<string>> {
  return computed(() => {
    const ids = new Set<string>();
    const selfId = deps.authSession.backendUser?.id?.trim() ?? '';
    const peerId = deps.dmCallWithUserId.value?.trim();
    // Group call targets use the group thread id — those belong in group ids only.
    if (peerId && !deps.groupDMs.value[peerId]) ids.add(peerId);
    for (const [channelId, participantUserIds] of deps
      .echoDmActiveCallParticipantUserIdsByChannelId.value) {
      if (deps.groupDMs.value[channelId]) continue;
      if (!participantUserIds.some((id) => id !== selfId)) continue;
      const persistedPeerId = deps.echoDmPeerByChannelId.value
        .get(channelId)
        ?.trim();
      if (persistedPeerId) ids.add(persistedPeerId);
    }
    return ids;
  });
}

export function useDmRailActiveCallGroupIds(deps: {
  dmCallWithUserId: Ref<string | null>;
  groupDMs: Ref<Record<string, unknown>>;
  echoDmActiveCallParticipantUserIdsByChannelId: Ref<Map<string, string[]>>;
}): ComputedRef<Set<string>> {
  return computed(() => {
    const ids = new Set<string>();
    const onlyWhenCall = deps.dmCallWithUserId.value?.trim();
    if (onlyWhenCall && deps.groupDMs.value[onlyWhenCall]) {
      ids.add(onlyWhenCall);
    }
    for (const [channelId, participantUserIds] of deps
      .echoDmActiveCallParticipantUserIdsByChannelId.value) {
      if (!deps.groupDMs.value[channelId]) continue;
      if (participantUserIds.length <= 0) continue;
      ids.add(channelId);
    }
    return ids;
  });
}

/**
 * Unread-map + latest-inbox resolver + active call id sets for the DM rail.
 * Caller still invokes `useAppLayoutDmRailUnread` (wiring-order marker).
 */
export function useAppLayoutDmRailUnreadInputs(
  deps: UseAppLayoutDmRailUnreadInputsDeps,
) {
  const dmUnreadByChannelIdForPanel = useDmAttentionUnreadMapForPanelComputed({
    dmAttentionByChannelId: deps.dmAttentionByChannelId,
    messagesByChannelId: deps.workspace.messages,
    readStateByChannelId: deps.readStateByChannelId,
    selfUserId: deps.currentUserIdForSocket,
    isDmChannelId: (channelId) => deps.isKnownDmChannelId(channelId),
  });

  deps.getLatestDmInboxTargetForRailRef.value =
    createLatestDmInboxTargetForRailResolver({
      selfId: deps.currentUserIdForSocket,
      users: deps.workspace.users,
      groupDMs: deps.groupDMs,
      messages: deps.workspace.messages,
      echoPeerByChannelId: deps.echoDmPeerByChannelId,
      echoDmLastActivityAtMsByChannelId: deps.echoDmLastActivityAtMsByChannelId,
      selectedDMUserId: deps.selectedDMUserId,
      activeChannelId: deps.activeChannelId,
      dmUnreadByChannelIdForPanel,
      hidden: deps.hiddenDmInboxStore,
      favorite: deps.favoriteDmInboxStore,
    });

  return {
    dmUnreadByChannelIdForPanel,
    activeCallUserIds: useDmRailActiveCallUserIds(deps),
    activeCallGroupIds: useDmRailActiveCallGroupIds(deps),
  };
}
