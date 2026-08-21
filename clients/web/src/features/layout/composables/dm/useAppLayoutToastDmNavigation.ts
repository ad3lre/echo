import type { Ref } from 'vue';
import type { useHiddenDmInboxStore } from '@/features/dm/hiddenDmInbox';
import { isViewingEchoConversationChannel } from '@/features/layout/isViewingEchoConversationChannel';

export function createAppLayoutOpenConversationChannel(deps: {
  echoDmThreadIds: Ref<Set<string>>;
  echoDmPeerByChannelId: Ref<Map<string, string>>;
  groupDMs: Ref<
    Record<string, { id: string; name?: string | null } | undefined>
  >;
  dmAttentionByChannelId: Ref<
    Record<string, { peerUserId?: string | null } | undefined>
  >;
  activeChannelId: Ref<string>;
  selectedDMUserId: Ref<string | null>;
  currentUserId: () => string | undefined;
  isKnownDmChannelId: (channelId: string) => boolean;
  findChannelContextById: (channelId: string) => {
    channel?: { name?: string | null } | null;
  } | null;
  handleActiveChannelChangeNavigation: (channelId: string) => void;
  selectDMTab: () => void;
  markEchoChannelAsRead: (
    channelId: string,
    opts?: { silent?: boolean },
  ) => void | Promise<void>;
  hiddenDmInboxStore: ReturnType<typeof useHiddenDmInboxStore>;
}): (channelId: string, authorId: string) => void {
  return (channelId: string, authorId: string) => {
    const cid = channelId.trim();
    if (!cid) return;
    const guildCtx = deps.findChannelContextById(cid);
    const dmSummary = deps.dmAttentionByChannelId.value[cid];
    const fromDmAttention = !!dmSummary && !guildCtx?.channel;
    const isDmTarget = deps.isKnownDmChannelId(cid) || fromDmAttention;
    if (!isDmTarget) return;
    if (!deps.echoDmThreadIds.value.has(cid)) {
      const next = new Set(deps.echoDmThreadIds.value);
      next.add(cid);
      deps.echoDmThreadIds.value = next;
    }
    deps.handleActiveChannelChangeNavigation(cid);
    const mappedPeerUserId = (
      deps.echoDmPeerByChannelId.value.get(cid) ?? ''
    ).trim();
    const canUseAuthorAsDmPeer =
      !deps.groupDMs.value[cid] &&
      !cid.startsWith('dm-group-') &&
      !!authorId.trim() &&
      authorId.trim() !== (deps.currentUserId() ?? '');
    const peerUserId = (
      dmSummary?.peerUserId ??
      mappedPeerUserId ??
      (canUseAuthorAsDmPeer ? authorId : '')
    ).trim();
    if (peerUserId) {
      deps.selectedDMUserId.value = peerUserId;
      if (!deps.echoDmPeerByChannelId.value.has(cid)) {
        const next = new Map(deps.echoDmPeerByChannelId.value);
        next.set(cid, peerUserId);
        deps.echoDmPeerByChannelId.value = next;
      }
      deps.hiddenDmInboxStore.unhideUser(peerUserId);
    } else {
      deps.hiddenDmInboxStore.unhideGroup(cid);
    }
    queueMicrotask(() => {
      deps.selectDMTab();
    });
    void deps.markEchoChannelAsRead(cid, { silent: true });
  };
}

export function createAppLayoutIsViewingConversationChannel(deps: {
  activeChannelId: Ref<string>;
  echoDmPeerByChannelId: Ref<Map<string, string>>;
  groupDMs: Ref<
    Record<string, { id: string; name?: string | null } | undefined>
  >;
}): (channelId: string) => boolean {
  return (channelId: string) =>
    isViewingEchoConversationChannel(channelId, deps.activeChannelId.value, {
      echoDmPeerByChannelId: deps.echoDmPeerByChannelId.value,
      groupDMs: deps.groupDMs.value,
    });
}
