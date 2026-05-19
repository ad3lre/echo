import type { EchoAttentionDmSummary } from '@shared/types';
import type { RawMessage } from '@/features/chat/chatMessageTypes';

type BuildDmAttentionUnreadCountByChannelOpts = {
  /** Local channel buckets; when present, unread is derived from message ids + read cursor. */
  messagesByChannelId?: Readonly<
    Record<string, readonly RawMessage[] | undefined>
  >;
  /** Per-channel local read cursor (optimistic + socket-updated). */
  readStateByChannelId?: Readonly<Record<string, string | null>>;
  /** Current user id; own messages do not count toward unread badges. */
  selfUserId?: string | null;
};

function countUnreadFromLocalMessages(params: {
  messages: readonly RawMessage[] | undefined;
  lastReadMessageId: string | null | undefined;
  selfUserId: string | null;
}): { hasLocalEvidence: boolean; unreadCount: number } {
  const { messages, lastReadMessageId, selfUserId } = params;
  if (!messages || messages.length === 0) {
    return { hasLocalEvidence: false, unreadCount: 0 };
  }
  const lr = lastReadMessageId?.trim() ?? '';
  if (!lr) {
    let unreadCount = 0;
    for (const message of messages) {
      if (!message) continue;
      if (selfUserId && message.authorId === selfUserId) continue;
      unreadCount += 1;
    }
    return { hasLocalEvidence: true, unreadCount };
  }
  // Messages are in chronological order. Find the read-cursor position and
  // count non-self messages after it — avoids broken localeCompare for UUIDs.
  let cursorIdx = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.id?.trim() === lr) {
      cursorIdx = i;
      break;
    }
  }
  let unreadCount = 0;
  if (cursorIdx >= 0) {
    // Cursor found in local messages — count messages strictly after it.
    for (let i = cursorIdx + 1; i < messages.length; i++) {
      const message = messages[i];
      if (!message) continue;
      if (selfUserId && message.authorId === selfUserId) continue;
      unreadCount += 1;
    }
  } else {
    // Cursor message is not in the local window (e.g. it's a newer message id
    // from the attention summary that hasn't been loaded yet).  Use numeric
    // BigInt comparison for snowflake ids so we don't miscount all messages as
    // unread just because the exact cursor record isn't present locally.
    let cursorBigInt: bigint | null = null;
    try {
      cursorBigInt = BigInt(lr);
    } catch {
      // Non-numeric id — no ordering fallback; count from the start.
    }
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (!message) continue;
      if (selfUserId && message.authorId === selfUserId) continue;
      if (cursorBigInt !== null) {
        const msgId = message.id?.trim() ?? '';
        if (msgId) {
          try {
            if (BigInt(msgId) <= cursorBigInt) continue;
          } catch {
            // Non-numeric message id; treat as unread.
          }
        }
      }
      unreadCount += 1;
    }
  }
  return { hasLocalEvidence: true, unreadCount };
}

/** Map channel id → positive unread count for DM panel badges. */
export function buildDmAttentionUnreadCountByChannel(
  dmAttentionByChannelId: Readonly<Record<string, EchoAttentionDmSummary>>,
  opts: BuildDmAttentionUnreadCountByChannelOpts = {},
): Map<string, number> {
  const m = new Map<string, number>();
  const messagesByChannelId = opts.messagesByChannelId ?? {};
  const readStateByChannelId = opts.readStateByChannelId ?? {};
  const selfUserId = opts.selfUserId?.trim() ?? null;
  for (const [ch, s] of Object.entries(dmAttentionByChannelId)) {
    if (!s?.unread) continue;
    const local = countUnreadFromLocalMessages({
      messages: messagesByChannelId[ch],
      lastReadMessageId: readStateByChannelId[ch] ?? null,
      selfUserId,
    });
    if (local.hasLocalEvidence) {
      m.set(ch, local.unreadCount);
      continue;
    }
    const n =
      typeof s.unreadCount === 'number' && s.unreadCount > 0
        ? s.unreadCount
        : 1;
    m.set(ch, n);
  }
  return m;
}
