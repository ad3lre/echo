import type { RawMessage } from '@/features/chat/chatMessageTypes';
import {
  echoDmChannelIdForPeerUser,
  type DmPanelInboxEntry,
} from '@/features/dm/buildDmPanelUserList';
import { messagePreviewPlainText } from '@/features/chat/domain/messagePreviewPlain';
import { rawMessageOrderingTimeMs } from '@/features/chat/domain/channelMessageOrder';

export type DmTypingUser = {
  userId: string;
  displayName: string;
};

export type DmConversationSubtitle = {
  text: string;
  isTyping: boolean;
};

const EMPTY_SUBTITLE: DmConversationSubtitle = { text: '', isTyping: false };

/** Candidate channel ids for a 1:1 peer (Echo snowflake + legacy `dm-{userId}`). */
export function peerDmChannelIds(
  peerUserId: string,
  echoPeerByChannelId: ReadonlyMap<string, string>,
): string[] {
  const ids: string[] = [];
  const echoCh = echoDmChannelIdForPeerUser(peerUserId, echoPeerByChannelId);
  if (echoCh) ids.push(echoCh);
  const legacy = `dm-${peerUserId}`;
  if (!ids.includes(legacy)) ids.push(legacy);
  return ids;
}

export function resolveInboxEntryChannelId(
  entry: DmPanelInboxEntry,
  echoPeerByChannelId: ReadonlyMap<string, string>,
): string | null {
  if (entry.kind === 'group') return entry.id;
  const ids = peerDmChannelIds(entry.id, echoPeerByChannelId);
  return ids[0] ?? null;
}

export function formatDmTypingSubtitle(input: {
  isDirect: boolean;
  typers: readonly DmTypingUser[];
}): string {
  const { isDirect, typers } = input;
  const n = typers.length;
  if (n === 0) return '';
  if (isDirect && n === 1) return 'Writing to you…';
  if (n === 1) return `${typers[0]!.displayName} is typing…`;
  if (n === 2) {
    return `${typers[0]!.displayName} and ${typers[1]!.displayName} are typing…`;
  }
  return 'Several people are typing…';
}

function latestMessageForChannelIds(
  channelIds: readonly string[],
  getMessages: (channelId: string) => readonly RawMessage[] | undefined,
): RawMessage | null {
  let best: RawMessage | null = null;
  let bestMs = 0;
  for (const channelId of channelIds) {
    const list = getMessages(channelId);
    if (!list?.length) continue;
    const last = list[list.length - 1]!;
    const t = rawMessageOrderingTimeMs(last);
    const ms = t != null && Number.isFinite(t) ? t : 0;
    if (ms >= bestMs) {
      bestMs = ms;
      best = last;
    }
  }
  return best;
}

function formatLastMessagePreview(input: {
  msg: RawMessage;
  selfId: string;
  isGroup: boolean;
  resolveAuthorName?: (userId: string) => string;
  maxLen?: number;
}): string {
  const preview = messagePreviewPlainText(input.msg, input.maxLen ?? 40);
  if (!preview) return '';
  const isSelf = input.msg.authorId === input.selfId;
  if (input.isGroup) {
    if (isSelf) return `You: ${preview}`;
    const authorName =
      input.resolveAuthorName?.(input.msg.authorId) ?? 'Someone';
    return `${authorName}: ${preview}`;
  }
  if (isSelf) return `You: ${preview}`;
  return preview;
}

export function resolveDmConversationSubtitle(input: {
  kind: 'user' | 'group';
  peerUserId?: string;
  groupChannelId?: string;
  selfId: string;
  echoPeerByChannelId: ReadonlyMap<string, string>;
  getMessages: (channelId: string) => readonly RawMessage[] | undefined;
  typersFor: (channelId: string) => readonly DmTypingUser[];
  resolveAuthorName?: (userId: string) => string;
  /** Cold-start subtitle snippets keyed by inbox row id (peer id or group channel id). */
  fallbackPreviewByKey?: ReadonlyMap<string, string>;
}): DmConversationSubtitle {
  const selfId = input.selfId.trim();
  if (!selfId) return EMPTY_SUBTITLE;

  const isGroup = input.kind === 'group';
  const isDirect = !isGroup;

  const channelIds: string[] = isGroup
    ? input.groupChannelId
      ? [input.groupChannelId]
      : []
    : input.peerUserId
      ? peerDmChannelIds(input.peerUserId, input.echoPeerByChannelId)
      : [];

  if (!channelIds.length) return EMPTY_SUBTITLE;

  for (const channelId of channelIds) {
    const typers = input.typersFor(channelId);
    if (typers.length > 0) {
      return {
        text: formatDmTypingSubtitle({ isDirect, typers }),
        isTyping: true,
      };
    }
  }

  const last = latestMessageForChannelIds(channelIds, input.getMessages);
  if (!last) {
    const rowId = isGroup
      ? input.groupChannelId?.trim()
      : input.peerUserId?.trim();
    const fallback = rowId
      ? input.fallbackPreviewByKey?.get(rowId)?.trim()
      : '';
    if (fallback) return { text: fallback, isTyping: false };
    return EMPTY_SUBTITLE;
  }

  const text = formatLastMessagePreview({
    msg: last,
    selfId,
    isGroup,
    resolveAuthorName: input.resolveAuthorName,
  });
  return text ? { text, isTyping: false } : EMPTY_SUBTITLE;
}

export function resolveDmInboxEntrySubtitle(
  entry: DmPanelInboxEntry,
  input: Omit<
    Parameters<typeof resolveDmConversationSubtitle>[0],
    'kind' | 'peerUserId' | 'groupChannelId'
  >,
): DmConversationSubtitle {
  return resolveDmConversationSubtitle({
    ...input,
    kind: entry.kind,
    peerUserId: entry.kind === 'user' ? entry.id : undefined,
    groupChannelId: entry.kind === 'group' ? entry.id : undefined,
  });
}
