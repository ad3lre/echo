import { computed, watch, type ComputedRef, type Ref } from 'vue';
import type { RailTab } from '@/features/layout/mainSurface';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import type { useHiddenDmInboxStore } from '@/features/dm/hiddenDmInbox';
import type { useFavoriteDmInboxStore } from '@/features/dm/favoriteDmInbox';
import { useDmInboxOrderCacheStore } from '@/features/dm/dmInboxOrderCache';
import { useAppLayoutDmPanelInboxComputed } from './useAppLayoutDmPanelInboxComputed';
import {
  useDmInboxUsersForPanelComputed,
  useGroupDmPanelListComputed,
} from './useDmPanelListComputeds';
import { sortFavoriteDmInboxFirst } from '@/features/dm/sortFavoriteDmInboxFirst';
import { filterVisibleDmInboxEntries } from '@/features/dm/filterVisibleDmInbox';
import {
  echoDmChannelIdForPeerUser,
  pinSelfDmInboxEntryFirst,
} from '@/features/dm/buildDmPanelUserList';
import { maxIncomingPeerMessageMs } from '@/features/dm/hiddenDmInboxUtils';
import { messagePreviewPlainText } from '@/features/chat/domain/messagePreviewPlain';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import { postEchoOpenDm } from '@/api/echo/social';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';

type GroupDmRow = {
  id: string;
  name: string;
  memberIds: string[];
  pfp?: string;
};

/**
 * DM inbox panel domain: the filtered/sorted inbox list, favorite + hide
 * handlers, the self-DM-thread bootstrap watcher, the unhide-on-activity sync,
 * and the per-session sort-order persistence. Owns its own order-cache store
 * (used nowhere else in the shell).
 */
export function useAppLayoutDmInboxPanel(deps: {
  activeRailTab: Ref<RailTab>;
  isDMPanelOpen: Ref<boolean>;
  currentUserIdForSocket: ComputedRef<string | undefined>;
  workspace: WorkspaceStateApi;
  groupDMs: Ref<Record<string, GroupDmRow>>;
  echoDmPeerByChannelId: Ref<Map<string, string>>;
  echoDmLastActivityAtMsByChannelId: Ref<Map<string, number>>;
  echoDmLastActivityIdByChannelId: Ref<Map<string, string>>;
  selectedDMUserId: Ref<string | null>;
  activeChannelId: Ref<string>;
  dmUnreadByChannelIdForPanel: ComputedRef<Map<string, number>>;
  activeGroupDM: ComputedRef<{ id: string } | null>;
  authSession: ReturnType<typeof useAuthSessionStore>;
  hiddenDmInboxStore: ReturnType<typeof useHiddenDmInboxStore>;
  favoriteDmInboxStore: ReturnType<typeof useFavoriteDmInboxStore>;
  mergeEchoDmThread: (thread: {
    kind: 'direct';
    channelId: string;
    peerUserId: string;
  }) => void;
}) {
  const {
    activeRailTab,
    isDMPanelOpen,
    currentUserIdForSocket,
    workspace,
    groupDMs,
    echoDmPeerByChannelId,
    echoDmLastActivityAtMsByChannelId,
    echoDmLastActivityIdByChannelId,
    selectedDMUserId,
    activeChannelId,
    dmUnreadByChannelIdForPanel,
    activeGroupDM,
    authSession,
    hiddenDmInboxStore,
    favoriteDmInboxStore,
    mergeEchoDmThread,
  } = deps;

  const dmInboxOrderCacheStore = useDmInboxOrderCacheStore();

  const dmInboxEntriesForPanelUnfiltered = useAppLayoutDmPanelInboxComputed({
    activeRailTab,
    isDMPanelOpen,
    selfId: currentUserIdForSocket,
    users: workspace.users,
    groupDMs,
    messages: workspace.messages,
    echoPeerByChannelId: echoDmPeerByChannelId,
    echoDmLastActivityAtMsByChannelId,
    selectedDMUserId,
    activeChannelId,
    dmUnreadByChannelIdForPanel,
    fallbackRankMsByKey: dmInboxOrderCacheStore.initialRankMsByKey,
  });
  const dmInboxEntriesForPanel = computed(() => {
    const selfUid = currentUserIdForSocket.value?.trim() ?? '';
    const sorted = sortFavoriteDmInboxFirst(
      filterVisibleDmInboxEntries(dmInboxEntriesForPanelUnfiltered.value, {
        isUserHidden: hiddenDmInboxStore.isUserHidden,
        isGroupHidden: hiddenDmInboxStore.isGroupHidden,
        selfUserId: selfUid,
      }),
      favoriteDmInboxStore,
    );
    return pinSelfDmInboxEntryFirst(sorted, selfUid);
  });

  let ensureEchoSelfDmThreadInFlight = false;
  watch(
    [
      () => workspace.socialGraphStatus.value,
      echoDmPeerByChannelId,
      () => authSession.backendUser?.id ?? '',
      () => authSession.backendUser?.isGuest === true,
      () => authSession.accessToken ?? '',
    ],
    () => {
      if (workspace.socialGraphStatus.value !== 'ready') return;
      if (echoSyncCapabilities.isMockDataMode) return;
      const selfId = authSession.backendUser?.id?.trim();
      if (!selfId || authSession.backendUser?.isGuest) return;
      const token = authSession.accessToken?.trim();
      if (!token) return;
      for (const p of echoDmPeerByChannelId.value.values()) {
        if (p === selfId) return;
      }
      if (ensureEchoSelfDmThreadInFlight) return;
      ensureEchoSelfDmThreadInFlight = true;
      void postEchoOpenDm(token, selfId)
        .then((r) => {
          const ch = String(r.channelId ?? '').trim();
          if (ch) {
            mergeEchoDmThread({
              kind: 'direct',
              channelId: ch,
              peerUserId: selfId,
            });
          }
        })
        .catch(() => {
          /* best-effort */
        })
        .finally(() => {
          ensureEchoSelfDmThreadInFlight = false;
        });
    },
    { flush: 'post' },
  );

  function isDmInboxUserFavorite(userId: string) {
    return favoriteDmInboxStore.isUserFavorite(userId);
  }

  function isDmInboxGroupFavorite(channelId: string) {
    return favoriteDmInboxStore.isGroupFavorite(channelId);
  }

  function toggleFavoriteDmInbox(
    payload:
      | { kind: 'user'; userId: string }
      | { kind: 'group'; channelId: string },
  ) {
    if (payload.kind === 'user') {
      favoriteDmInboxStore.toggleUser(payload.userId);
    } else {
      favoriteDmInboxStore.toggleGroup(payload.channelId);
    }
  }
  const dmUsersForDmPanelComputed = useDmInboxUsersForPanelComputed(
    dmInboxEntriesForPanel,
  );

  watch(
    [workspace.messages, echoDmLastActivityAtMsByChannelId],
    () => {
      const selfId = currentUserIdForSocket.value?.trim() ?? '';
      if (!selfId) return;
      hiddenDmInboxStore.syncUnhide({
        selfId,
        messages: workspace.messages.value,
        echoPeerByChannelId: echoDmPeerByChannelId.value,
        echoDmLastActivityIdByChannelId: echoDmLastActivityIdByChannelId.value,
      });
    },
    { deep: true },
  );

  /**
   * Persist real per-entry `lastActivityAt` (ms epoch) keyed by inbox row id so the
   * next session's cold-start render matches this session's last live render exactly.
   * For 1:1 rows the row id is the peer user id, so we look up the channel id via
   * `echoDmPeerByChannelId`; for groups the row id IS the channel id.
   */
  watch(dmInboxEntriesForPanel, (entries) => {
    if (!entries.length) return;
    const ats = echoDmLastActivityAtMsByChannelId.value;
    const peerByCh = echoDmPeerByChannelId.value;
    const channelIdForPeer = new Map<string, string>();
    for (const [ch, peer] of peerByCh) {
      if (!channelIdForPeer.has(peer)) channelIdForPeer.set(peer, ch);
    }
    const payload = entries.map((e) => {
      const channelId =
        e.kind === 'group' ? e.id : (channelIdForPeer.get(e.id) ?? '');
      const msgs = channelId ? workspace.messages.value[channelId] : undefined;
      const last = msgs?.length ? msgs[msgs.length - 1] : undefined;
      const previewPlainText = last
        ? messagePreviewPlainText(last, 220) || undefined
        : undefined;
      if (e.kind === 'group') {
        return {
          id: e.id,
          rankMs: ats.get(e.id) ?? 0,
          previewPlainText,
        };
      }
      const ch = channelIdForPeer.get(e.id) ?? '';
      return {
        id: e.id,
        rankMs: ch ? (ats.get(ch) ?? 0) : 0,
        previewPlainText,
      };
    });
    dmInboxOrderCacheStore.saveOrder(payload);
  });

  function hideDmFromInboxUser(peerId: string) {
    const selfId = currentUserIdForSocket.value?.trim() ?? '';
    if (!selfId || peerId === selfId) return;
    const snap = maxIncomingPeerMessageMs(
      peerId,
      selfId,
      workspace.messages.value,
      echoDmPeerByChannelId.value,
    );
    hiddenDmInboxStore.hideUser(peerId, snap);
    if (selectedDMUserId.value === peerId) {
      selectedDMUserId.value = null;
    }
    const echoCh = echoDmChannelIdForPeerUser(
      peerId,
      echoDmPeerByChannelId.value,
    );
    const ac = activeChannelId.value;
    if (ac === `dm-${peerId}` || (echoCh && ac === echoCh)) {
      activeChannelId.value = 'general';
    }
    dispatchAppToast(
      'Removed from your DM list. It will return when they message you again.',
      'info',
    );
  }

  function hideDmFromInboxGroup(channelId: string) {
    const act = echoDmLastActivityIdByChannelId.value.get(channelId) ?? '';
    hiddenDmInboxStore.hideGroup(channelId, act);
    if (activeGroupDM.value?.id === channelId) {
      activeChannelId.value = 'general';
    }
    dispatchAppToast(
      'Removed from your DM list. It will return when there is new activity.',
      'info',
    );
  }
  const groupDMListForPanelComputed = useGroupDmPanelListComputed(groupDMs);

  return {
    dmInboxEntriesForPanel,
    dmUsersForDmPanelComputed,
    groupDMListForPanelComputed,
    isDmInboxUserFavorite,
    isDmInboxGroupFavorite,
    toggleFavoriteDmInbox,
    hideDmFromInboxUser,
    hideDmFromInboxGroup,
  };
}
