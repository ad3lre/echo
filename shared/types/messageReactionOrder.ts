import type { MessageReaction } from './message';

/**
 * Display order: highest `count` first, then earliest `firstReactionAt`, then `emoji` for stability.
 */
export function compareMessageReactionsDisplayOrder(
  a: MessageReaction,
  b: MessageReaction,
): number {
  if (b.count !== a.count) return b.count - a.count;
  const ta = a.firstReactionAt ?? '';
  const tb = b.firstReactionAt ?? '';
  if (ta !== tb) return ta.localeCompare(tb);
  return a.emoji.localeCompare(b.emoji);
}

export function sortMessageReactionsForDisplay(
  reactions: MessageReaction[] | undefined,
): MessageReaction[] | undefined {
  if (!reactions?.length) return reactions;
  return [...reactions].sort(compareMessageReactionsDisplayOrder);
}
