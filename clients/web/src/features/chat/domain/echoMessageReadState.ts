import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { compareRawMessagesChronologically } from '@/features/chat/domain/channelMessageOrder';

export type EchoMessageReadState = 'read' | 'unread';

/**
 * Compare two timeline IDs. Numeric strings use BigInt; others fall back to
 * lexicographic text order (matches Postgres `text >` for ASCII UUIDs).
 * Returns negative, 0, or positive.
 */
export function compareEchoTimelineIds(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  try {
    const ai = BigInt(a);
    const bi = BigInt(b);
    if (ai === bi) return 0;
    return ai > bi ? 1 : -1;
  } catch {
    return a < b ? -1 : a > b ? 1 : 0;
  }
}

/**
 * Determine whether `seenId` is strictly ahead of `cursorId` for read-state
 * advancement.  When both are numeric snowflakes, BigInt comparison is used.
 * Otherwise, fall back to chronological position within loaded messages.
 * Returns `false` when ordering cannot be determined (prevents spurious writes).
 */
export function isSeenAheadOfCursor(
  seenId: string,
  cursorId: string,
  channelMessages?: readonly RawMessage[],
): boolean {
  if (seenId === cursorId) return false;
  try {
    return BigInt(seenId) > BigInt(cursorId);
  } catch {
    // Non-numeric IDs — use chronologically-sorted array position
  }
  if (channelMessages && channelMessages.length > 0) {
    let seenIdx = -1;
    let cursorIdx = -1;
    for (let i = 0; i < channelMessages.length; i++) {
      const id = channelMessages[i]?.id;
      if (id === seenId) seenIdx = i;
      if (id === cursorId) cursorIdx = i;
    }
    if (seenIdx >= 0 && cursorIdx >= 0) return seenIdx > cursorIdx;
  }
  return false;
}

export function isEchoMessageRead(
  lastReadMessageId: string | null | undefined,
  messageId: string | null | undefined,
): boolean {
  if (!lastReadMessageId || !messageId) return false;
  return compareEchoTimelineIds(lastReadMessageId, messageId) >= 0;
}

export function resolveEchoMessageReadState(params: {
  lastReadMessageId: string | null | undefined;
  messageId: string | null | undefined;
}): EchoMessageReadState {
  return isEchoMessageRead(params.lastReadMessageId, params.messageId)
    ? 'read'
    : 'unread';
}

export function isEchoMessageUnreadFromBoundary(
  firstUnreadMessageId: string | null | undefined,
  messageId: string | null | undefined,
): boolean {
  if (!firstUnreadMessageId || !messageId) return false;
  return compareEchoTimelineIds(messageId, firstUnreadMessageId) >= 0;
}

export function resolveEchoMessageReadStateFromBoundary(params: {
  firstUnreadMessageId: string | null | undefined;
  messageId: string | null | undefined;
}): EchoMessageReadState {
  return isEchoMessageUnreadFromBoundary(
    params.firstUnreadMessageId,
    params.messageId,
  )
    ? 'unread'
    : 'read';
}

/**
 * Read/unread for list rows: matches {@link compareRawMessagesChronologically} order when the
 * last-read anchor message is loaded; otherwise falls back to id ordering. When no last-read
 * cursor exists, uses the server `firstUnreadMessageId` boundary.
 */
export function resolveEchoMessageReadStateForMessageList(params: {
  messageEntity: RawMessage;
  lastReadMessageId: string | null | undefined;
  lastReadAnchorEntity: RawMessage | undefined;
  firstUnreadMessageId: string | null | undefined;
}): EchoMessageReadState {
  const lr = params.lastReadMessageId?.trim() ?? '';
  if (lr) {
    const anchor = params.lastReadAnchorEntity;
    if (anchor?.id && anchor.id === lr) {
      return compareRawMessagesChronologically(params.messageEntity, anchor) <=
        0
        ? 'read'
        : 'unread';
    }
    return isEchoMessageRead(lr, params.messageEntity.id) ? 'read' : 'unread';
  }
  return resolveEchoMessageReadStateFromBoundary({
    firstUnreadMessageId: params.firstUnreadMessageId,
    messageId: params.messageEntity.id,
  });
}
