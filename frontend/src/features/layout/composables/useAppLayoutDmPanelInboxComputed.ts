import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import type { RailTab } from '@/features/layout/mainSurface';
import {
  buildDmPanelInboxList,
  type DmPanelInboxEntry,
} from '@/features/dm/buildDmPanelUserList';
import {
  getActiveIndexMap,
  getChannelIndex,
} from '@/features/chat/domain/channelMessageIndex';

type GroupDmRow = {
  id: string;
  name: string;
  memberIds: string[];
  pfp?: string;
};

const EMPTY_DM_INBOX_ENTRIES: DmPanelInboxEntry[] = [];

/**
 * DM panel inbox rows; skips heavy work when DM UI is closed (server rail stays snappy).
 */
export function useAppLayoutDmPanelInboxComputed(deps: {
  activeRailTab: Ref<RailTab>;
  isDMPanelOpen: Ref<boolean>;
  selfId: { readonly value: string | undefined };
  users: Ref<Array<{ id: string; name: string; pfp: string; status: string }>>;
  groupDMs: Ref<Record<string, GroupDmRow>>;
  messages: Ref<Record<string, RawMessage[]>>;
  echoPeerByChannelId: Ref<Map<string, string>>;
  echoDmLastActivityIdByChannelId: Ref<Map<string, string>>;
  selectedDMUserId: Ref<string | null>;
  activeChannelId: Ref<string>;
  dmUnreadByChannelIdForPanel: ComputedRef<Map<string, number>>;
}) {
  return computed(() => {
    if (deps.activeRailTab.value !== 'dm' && !deps.isDMPanelOpen.value) {
      return EMPTY_DM_INBOX_ENTRIES;
    }
    const users = deps.users.value;
    const groups = Object.values(deps.groupDMs.value).map((row) => ({
      id: row.id,
      name: row.name,
      pfp: row.pfp ?? '',
    }));
    const indexedMessageKeys = new Set<string>([
      ...Object.keys(deps.messages.value),
      ...getActiveIndexMap().keys(),
    ]);
    return buildDmPanelInboxList({
      selfId: deps.selfId.value ?? '',
      echoPeerByChannelId: deps.echoPeerByChannelId.value,
      activityIdByChannelId: deps.echoDmLastActivityIdByChannelId.value,
      messageKeys: [...indexedMessageKeys],
      getMessages: (ch) =>
        getChannelIndex(ch, deps.messages.value[ch] ?? []).sorted.value,
      usersById: new Map(users.map((u) => [u.id, u])),
      selectedDmUserId: deps.selectedDMUserId.value,
      groups,
      activeInboxChannelId: deps.activeChannelId.value?.trim() ?? '',
      dmUnreadByChannelId: deps.dmUnreadByChannelIdForPanel.value,
    });
  });
}
