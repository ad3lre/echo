import type { ComputedRef, Ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import {
  getActiveIndexMap,
  getChannelIndex,
} from '@/features/chat/domain/channelMessageIndex';
import { buildDmPanelInboxList } from '@/features/dm/buildDmPanelUserList';
import { filterVisibleDmInboxEntries } from '@/features/dm/filterVisibleDmInbox';
import { sortFavoriteDmInboxFirst } from '@/features/dm/sortFavoriteDmInboxFirst';

type GroupDmRow = {
  id: string;
  name: string;
  memberIds: string[];
  pfp?: string;
};

export type LatestDmInboxRailTarget =
  | { kind: 'user'; userId: string }
  | { kind: 'group'; channelId: string };

/**
 * Same basis as the DM panel inbox (favorites, visibility), for rail “open latest” including group DMs.
 */
export function createLatestDmInboxTargetForRailResolver(deps: {
  selfId: Ref<string | undefined>;
  users: Ref<Array<{ id: string; name: string; pfp: string; status: string }>>;
  groupDMs: Ref<Record<string, GroupDmRow>>;
  messages: Ref<Record<string, RawMessage[]>>;
  echoPeerByChannelId: Ref<Map<string, string>>;
  echoDmLastActivityIdByChannelId: Ref<Map<string, string>>;
  selectedDMUserId: Ref<string | null>;
  activeChannelId: Ref<string>;
  dmUnreadByChannelIdForPanel:
    | Ref<Map<string, number>>
    | ComputedRef<Map<string, number>>;
  hidden: {
    isUserHidden: (id: string) => boolean;
    isGroupHidden: (id: string) => boolean;
  };
  favorite: {
    isUserFavorite: (userId: string) => boolean;
    isGroupFavorite: (channelId: string) => boolean;
  };
}) {
  return function getLatestDmInboxTargetForRail(): LatestDmInboxRailTarget | null {
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
    const list = buildDmPanelInboxList({
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
    const visible = filterVisibleDmInboxEntries(list, deps.hidden);
    const sorted = sortFavoriteDmInboxFirst(visible, deps.favorite);
    const first = sorted[0];
    if (!first) return null;
    if (first.kind === 'group') return { kind: 'group', channelId: first.id };
    return { kind: 'user', userId: first.id };
  };
}
