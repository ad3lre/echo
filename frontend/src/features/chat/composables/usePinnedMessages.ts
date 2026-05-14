import { computed, nextTick, ref, type Ref } from 'vue';
import type { MessageAuthor, MessageWithAuthor } from '@shared/types';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { normalizeMessageAttachments } from '@/utils/normalizeMessageAttachments';
import { getChannelIndex } from '@/features/chat/domain/channelMessageIndex';

type PinnedMessage = {
  id?: string;
  content?: string;
  imageUrl?: string;
  videoUrl?: string;
  stickers?: MessageWithAuthor['stickers'];
  poll?: unknown;
  author?: { avatar?: string; name?: string };
};

type UserForAuthor = {
  id: string;
  name: string;
  pfp: string;
  status: string;
};

function mapRawMessagesWithAuthors(
  rawList: readonly RawMessage[],
  users: UserForAuthor[],
): MessageWithAuthor[] {
  const lookup = new Map(users.map((u) => [u.id, u] as const));
  return rawList.map((msg): MessageWithAuthor => {
    const user = lookup.get(msg.authorId);
    const author: MessageAuthor = user
      ? {
          id: user.id,
          name: user.name,
          avatar: user.pfp,
          status: user.status as MessageAuthor['status'],
        }
      : {
          id: msg.authorId,
          name: msg.authorDisplayName?.trim() || 'Unknown',
          avatar: msg.authorAvatar?.trim() ?? '',
        };
    return {
      ...msg,
      author,
      attachments: normalizeMessageAttachments(msg.attachments),
    } as MessageWithAuthor;
  });
}

/**
 * @param pinChannelId — Echo wire id for pin storage (resolves `dm-{userId}` → snowflake when mapped).
 */
export function usePinnedMessages(
  pinChannelId: Ref<string>,
  messages: Ref<Record<string, RawMessage[]>>,
  users: Ref<UserForAuthor[]>,
  onGoToMessage: (channelId: string, messageId: string) => void,
) {
  const pinnedByChannel = ref<Record<string, string[]>>({});
  const isPinsDropdownOpen = ref(false);
  const pinsButtonRefDm = ref<HTMLElement | null>(null);
  const pinsButtonRefServer = ref<HTMLElement | null>(null);
  const pinsDropdownRect = ref<DOMRect | null>(null);

  const pinnedMessageIdsForCurrentChannel = computed(() => {
    const cid = pinChannelId.value;
    return cid ? (pinnedByChannel.value[cid] ?? []) : [];
  });

  const pinnedMessagesForDropdown = computed(() => {
    const cid = pinChannelId.value;
    const ids = pinnedByChannel.value[cid];
    if (!cid || !ids?.length) return [];
    const rawList = getChannelIndex(cid, messages.value[cid] ?? []).sorted
      .value;
    const withAuthors = mapRawMessagesWithAuthors(rawList, users.value);
    return ids
      .map((id) => withAuthors.find((m) => m.id === id))
      .filter(Boolean) as PinnedMessage[];
  });

  function pinMessage(channelId: string, messageId: string) {
    const cur = pinnedByChannel.value[channelId] ?? [];
    if (cur.includes(messageId)) return;
    pinnedByChannel.value = {
      ...pinnedByChannel.value,
      [channelId]: [messageId, ...cur],
    };
  }

  function unpinMessage(channelId: string, messageId: string) {
    const cur = pinnedByChannel.value[channelId] ?? [];
    pinnedByChannel.value = {
      ...pinnedByChannel.value,
      [channelId]: cur.filter((id) => id !== messageId),
    };
  }

  /** Replace pin order for a channel (server snapshot / `message:pins`). */
  function setPinnedMessageIdsForChannel(
    channelId: string,
    messageIds: string[],
  ) {
    pinnedByChannel.value = {
      ...pinnedByChannel.value,
      [channelId]: [...messageIds],
    };
  }

  /** Copy for optimistic pin / transaction rollback. */
  function getPinnedIdsSnapshot(channelId: string): string[] {
    return [...(pinnedByChannel.value[channelId] ?? [])];
  }

  async function togglePinsDropdown() {
    isPinsDropdownOpen.value = !isPinsDropdownOpen.value;
    if (isPinsDropdownOpen.value) {
      await nextTick();
      const btn = pinsButtonRefDm.value ?? pinsButtonRefServer.value;
      pinsDropdownRect.value = btn?.getBoundingClientRect() ?? null;
    } else {
      pinsDropdownRect.value = null;
    }
  }

  function closePinsDropdown() {
    isPinsDropdownOpen.value = false;
  }

  function goToPinnedMessage(messageId: string) {
    const cid = pinChannelId.value;
    if (cid) onGoToMessage(cid, messageId);
    closePinsDropdown();
  }

  function pinPreview(msg: PinnedMessage): string {
    if (msg.content?.trim()) return msg.content.trim();
    if (msg.imageUrl) return '[Image]';
    if (msg.videoUrl) return '[Video]';
    if (msg.stickers?.length) return '[Sticker]';
    if (msg.poll) return '[Poll]';
    return '[Message]';
  }

  return {
    pinnedByChannel,
    isPinsDropdownOpen,
    pinsButtonRefDm,
    pinsButtonRefServer,
    pinsDropdownRect,
    pinnedMessageIdsForCurrentChannel,
    pinnedMessagesForDropdown,
    pinMessage,
    unpinMessage,
    setPinnedMessageIdsForChannel,
    getPinnedIdsSnapshot,
    togglePinsDropdown,
    closePinsDropdown,
    goToPinnedMessage,
    pinPreview,
  };
}
