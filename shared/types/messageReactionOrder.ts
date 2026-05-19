import type { MessageReaction } from './message';

/**
 * Display order: highest `count` first, then most recent `lastReactionAt`, then `emoji` for stability.
 */
export function compareMessageReactionsDisplayOrder(
  a: MessageReaction,
  b: MessageReaction,
): number {
  if (b.count !== a.count) return b.count - a.count;
  const ta = a.lastReactionAt ?? '';
  const tb = b.lastReactionAt ?? '';
  if (tb !== ta) return tb.localeCompare(ta);
  return a.emoji.localeCompare(b.emoji);
}

export function sortMessageReactionsForDisplay(
  reactions: MessageReaction[] | undefined,
): MessageReaction[] | undefined {
  if (!reactions?.length) return reactions;
  return [...reactions].sort(compareMessageReactionsDisplayOrder);
}
