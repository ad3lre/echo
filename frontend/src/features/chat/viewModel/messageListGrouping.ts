import type { MessageWithAuthor } from '@shared/types';

/**
 * **Grouping rules live here** (and in row-facts builders) — not in templates or bubbles.
 * compact: group only when the wall-clock minute matches (each message has its own
 * ISO timestamp). See `@/features/chat/domain/viewportContract`.
 */
export function sameLocalCalendarMinute(
  a: string | undefined,
  b: string | undefined,
): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const da = new Date(a);
  const db = new Date(b);
  const ta = da.getTime();
  const tb = db.getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate() &&
    da.getHours() === db.getHours() &&
    da.getMinutes() === db.getMinutes()
  );
}

/**
 * Virtual list grouping: O(1) per index — true when this row shares a visual cluster with the previous message.
 */
export function isMessageGroupedWithPrevious(
  orderedIds: readonly string[],
  messagesMap: Map<string, MessageWithAuthor>,
  index: number,
): boolean {
  if (index <= 0 || index >= orderedIds.length) return false;
  const msgId = orderedIds[index];
  const prevId = orderedIds[index - 1];
  if (!msgId || !prevId) return false;
  const msg = messagesMap.get(msgId);
  const prev = messagesMap.get(prevId);
  if (!msg || !prev) return false;
  if (msg.systemMessage || prev.systemMessage) return false;
  if (msg.authorId !== prev.authorId) return false;
  if (msg.replyTo) return false;
  if (!sameLocalCalendarMinute(msg.timestamp, prev.timestamp)) return false;
  return true;
}

/**
 * True when the **next** row is a continuation of this one (same visual cluster downward).
 */
export function isMessageGroupedWithNext(
  orderedIds: readonly string[],
  messagesMap: Map<string, MessageWithAuthor>,
  index: number,
): boolean {
  return isMessageGroupedWithPrevious(orderedIds, messagesMap, index + 1);
}
