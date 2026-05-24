import { ref, computed, type Ref } from 'vue';
import type {
  ChannelSummary,
  ForwardedFrom,
  Message,
  MessageWithAuthor,
} from '@shared/types';
import { LEGACY_ENCRYPTED_CHAT_MESSAGE_PLACEHOLDER } from '@shared/chatE2eePolicy';
import { plainTextFromEchoContentJson } from '@/features/chat/editor/echoContentJsonPlainText';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { safeImageUrl } from '@/utils/safeImageUrl';

const PREVIEW_MAX = 400;

function resolveForwardSourceChannelId(
  message: MessageWithAuthor & { channelName?: string },
  activeChannelId: string,
): string {
  const mid = message.channelId?.trim();
  if (mid) return mid;
  return activeChannelId.trim();
}

/** Best-effort preview line for the forward card (server still re-resolves from DB). */
export function buildForwardContentPreview(
  src: MessageWithAuthor & { channelName?: string },
): string {
  const enc = (src as Message & MessageWithAuthor).encryption;
  if (enc?.kind === 'e2ee') {
    return LEGACY_ENCRYPTED_CHAT_MESSAGE_PLACEHOLDER;
  }
  if (src.poll?.question?.trim()) {
    return `[Poll] ${src.poll.question.trim()}`;
  }
  const rawText = (src.contentText ?? src.content ?? '').trim();
  if (rawText) {
    return rawText.length > PREVIEW_MAX
      ? `${rawText.slice(0, PREVIEW_MAX - 1)}…`
      : rawText;
  }
  const mf = src.messageFormatVersion ?? 1;
  if (mf >= 2 && src.contentJson) {
    const fromJson = plainTextFromEchoContentJson(src.contentJson).trim();
    if (fromJson) {
      return fromJson.length > PREVIEW_MAX
        ? `${fromJson.slice(0, PREVIEW_MAX - 1)}…`
        : fromJson;
    }
  }
  const n = src.attachments?.length ?? 0;
  if (n > 0) {
    const fn = src.attachments![0]!.filename?.trim();
    return n === 1
      ? fn
        ? `[Attachment: ${fn}]`
        : '[Attachment]'
      : `[${n} attachments]`;
  }
  if (src.imageUrl || src.videoUrl || src.gif) {
    return '[Media]';
  }
  return '(no text)';
}

export function useAppLayoutForwardMessage(deps: {
  activeChannelId: Ref<string>;
  /** When false, block forward and prompt user to reconnect (realtime required). */
  isLiveSocketReady: () => boolean;
  echoDmPeerByChannelId: Ref<Map<string, string>>;
  echoDmThreadIds: Ref<Set<string>>;
  /** Snowflake activity IDs used to sort DMs by recency (higher = more recent). */
  echoDmLastActivityIdByChannelId?: Ref<Map<string, string>>;
  groupDMs: Ref<Record<string, { id: string; name: string; pfp?: string }>>;
  users: Ref<Array<{ id: string; name: string; pfp: string }>>;
  servers: { readonly value: Array<{ id: string; name: string }> };
  categoriesByServer: Ref<
    Record<
      string,
      Array<{ channels: Array<ChannelSummary & { canViewChannel?: boolean }> }>
    >
  >;
  sendMessage: (
    channelId: string,
    content: string,
    mentions?: undefined,
    imageUrl?: undefined,
    poll?: undefined,
    gif?: undefined,
    replyTo?: undefined,
    imageSpoiler?: undefined,
    videoUrl?: undefined,
    attachments?: undefined,
    contentJson?: undefined,
    contentSchemaVersion?: undefined,
    forwardMessageId?: string,
    forwardPreview?: ForwardedFrom,
  ) => void;
}) {
  const forwardModalOpen = ref(false);
  const forwardSourceMessage = ref<
    (MessageWithAuthor & { channelName?: string }) | null
  >(null);

  const forwardPickerDestinations = computed(() => {
    const active = deps.activeChannelId.value.trim();
    /** Channel the source message belongs to (prefer message.channelId). */
    const sourceCh = forwardSourceMessage.value?.channelId?.trim() || active;
    const dms: {
      channelId: string;
      label: string;
      avatarUrl?: string;
      isGroup: boolean;
    }[] = [];
    const peerMap = deps.echoDmPeerByChannelId.value;
    const usersById = new Map(deps.users.value.map((u) => [u.id, u]));
    const activityMap = deps.echoDmLastActivityIdByChannelId?.value;
    for (const chId of deps.echoDmThreadIds.value) {
      if (chId === sourceCh) continue;
      const g = deps.groupDMs.value[chId];
      if (g) {
        dms.push({
          channelId: chId,
          label: g.name?.trim() || 'Group',
          avatarUrl: g.pfp ? safeImageUrl(g.pfp) : undefined,
          isGroup: true,
        });
        continue;
      }
      const peer = peerMap.get(chId);
      const u = peer ? usersById.get(peer) : undefined;
      dms.push({
        channelId: chId,
        label: u?.name ?? 'Direct message',
        avatarUrl: u?.pfp ? safeImageUrl(u.pfp) : undefined,
        isGroup: false,
      });
    }
    // Sort by recency (snowflake id — higher = more recent). Fall back to alphabetical.
    if (activityMap && activityMap.size > 0) {
      dms.sort((a, b) => {
        const aAct = activityMap.get(a.channelId) ?? '';
        const bAct = activityMap.get(b.channelId) ?? '';
        if (aAct && bAct) return bAct.localeCompare(aAct);
        if (aAct) return -1;
        if (bAct) return 1;
        return a.label.localeCompare(b.label);
      });
    } else {
      dms.sort((a, b) => a.label.localeCompare(b.label));
    }

    const servers: {
      id: string;
      name: string;
      textChannels: { id: string; name: string }[];
    }[] = [];
    for (const s of deps.servers.value) {
      if (s.id === 'echo') continue;
      const cats = deps.categoriesByServer.value[s.id] ?? [];
      const textChannels: { id: string; name: string }[] = [];
      for (const cat of cats) {
        for (const ch of cat.channels) {
          if (ch.type !== 'text') continue;
          if (ch.id === sourceCh) continue;
          if (ch.canViewChannel === false) continue;
          textChannels.push({ id: ch.id, name: `#${ch.name}` });
        }
      }
      if (textChannels.length) {
        textChannels.sort((a, b) => a.name.localeCompare(b.name));
        servers.push({ id: s.id, name: s.name, textChannels });
      }
    }
    servers.sort((a, b) => a.name.localeCompare(b.name));
    return { dms, servers };
  });

  function openForwardMessagePicker(
    message: MessageWithAuthor & { channelName?: string },
  ) {
    if (!message.id) return;
    forwardSourceMessage.value = message;
    forwardModalOpen.value = true;
  }

  function closeForwardMessagePicker() {
    forwardModalOpen.value = false;
    forwardSourceMessage.value = null;
  }

  function submitForwardedMessage(targetChannelId: string) {
    const src = forwardSourceMessage.value;
    if (!src?.id) {
      closeForwardMessagePicker();
      return;
    }
    if (!deps.isLiveSocketReady()) {
      dispatchAppToast(
        'You must be online to forward messages. Wait for the connection, then try again.',
        'warning',
      );
      return;
    }
    const active = deps.activeChannelId.value.trim();
    if (!active) {
      closeForwardMessagePicker();
      return;
    }
    const srcChannel = resolveForwardSourceChannelId(src, active);
    const authorName = src.author?.name?.trim() || 'Unknown';
    const preview: ForwardedFrom = {
      messageId: src.id,
      channelId: srcChannel,
      authorName,
      ...(src.author.avatar?.trim()
        ? { authorAvatar: src.author.avatar.trim() }
        : {}),
      contentPreview: buildForwardContentPreview(src),
    };
    try {
      deps.sendMessage(
        targetChannelId,
        '',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        src.id,
        preview,
      );
      dispatchAppToast('Forward queued for delivery.', 'info');
    } catch {
      dispatchAppToast('Could not forward message', 'warning');
      return;
    }
    closeForwardMessagePicker();
  }

  const forwardModalSourceSummary = computed(() => {
    const m = forwardSourceMessage.value;
    if (!m) return '';
    const name = m.author?.name?.trim() || 'Unknown';
    const body = buildForwardContentPreview(m);
    const snippet = body.length > 80 ? `${body.slice(0, 80)}\u2026` : body;
    return snippet ? `${name}: ${snippet}` : name;
  });

  return {
    forwardModalOpen,
    forwardPickerDestinations,
    forwardModalSourceSummary,
    openForwardMessagePicker,
    closeForwardMessagePicker,
    submitForwardedMessage,
  };
}
