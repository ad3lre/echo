import type { MessageReaction } from '@shared/types';
import { sortMessageReactionsForDisplay } from '@shared/types';

export type PendingReactionToggleIntent = {
  emoji: string;
  userId: string;
  removing: boolean;
  /** Snapshot before this toggle — used to judge fan-out count regressions. */
  previousReactions: MessageReaction[] | undefined;
};

/** True when the authoritative (or fan-out) row already matches the pending intent. */
export function reactionSnapshotSatisfiesPendingIntent(
  reactions: MessageReaction[] | undefined,
  intent: PendingReactionToggleIntent,
): boolean {
  const row = reactions?.find((r) => r.emoji === intent.emoji);
  if (intent.removing) {
    if (!row || row.count <= 0) return true;
    if (row.userIds.length > 0) return !row.userIds.includes(intent.userId);
    const prev = intent.previousReactions?.find(
      (r) => r.emoji === intent.emoji,
    );
    return !!prev && row.count < prev.count;
  }
  if (!row || row.count <= 0) return false;
  if (row.userIds.length > 0) return row.userIds.includes(intent.userId);
  // Count-only fan-out: accept presence; stale empties are caught by count <= 0.
  return true;
}

/**
 * Force viewer membership for one emoji without toggle flip-flop.
 * Used to re-assert optimistic intent after a possibly-stale `message:reactions` snapshot.
 */
export function applyPendingReactionIntent(
  reactions: MessageReaction[] | undefined,
  intent: PendingReactionToggleIntent,
): MessageReaction[] | undefined {
  const list = [...(reactions ?? [])];
  const idx = list.findIndex((r) => r.emoji === intent.emoji);
  const existing = idx >= 0 ? list[idx]! : undefined;

  if (intent.removing) {
    if (!existing) return reactions;
    if (existing.userIds.length > 0) {
      if (!existing.userIds.includes(intent.userId)) return reactions;
      const nextUserIds = existing.userIds.filter((id) => id !== intent.userId);
      const nextCount = Math.max(0, existing.count - 1);
      if (nextCount === 0) {
        list.splice(idx, 1);
      } else {
        list[idx] = { ...existing, userIds: nextUserIds, count: nextCount };
      }
    } else {
      // Fan-out row with us "logically" present via prior optimistic UI: drop one.
      const nextCount = Math.max(0, existing.count - 1);
      if (nextCount === 0) list.splice(idx, 1);
      else list[idx] = { ...existing, count: nextCount };
    }
  } else if (!existing) {
    list.push({
      emoji: intent.emoji,
      count: 1,
      userIds: [intent.userId],
      firstReactionAt: new Date().toISOString(),
    });
  } else if (existing.userIds.includes(intent.userId)) {
    return reactions;
  } else if (existing.userIds.length === 0) {
    // Fan-out summary: keep count, attach viewer highlight.
    list[idx] = { ...existing, userIds: [intent.userId] };
  } else {
    list[idx] = {
      ...existing,
      userIds: [...existing.userIds, intent.userId],
      count: existing.count + 1,
    };
  }

  const ordered = sortMessageReactionsForDisplay(list) ?? list;
  return ordered.length > 0 ? ordered : undefined;
}

export type PendingReactionToggleLike = {
  emoji: string;
  userId: string;
  removing: boolean;
  previousReactions: MessageReaction[] | undefined;
};

/**
 * Re-assert unsatisfied optimistic toggles over a possibly-stale snapshot.
 * Returns the reactions to store and whether every pending intent was already met
 * (so the UI transaction manager can commit/drop them).
 */
export function reconcilePendingReactionTogglesOnSnapshot(
  reactions: MessageReaction[] | undefined,
  pending: readonly PendingReactionToggleLike[],
): { reactions: MessageReaction[] | undefined; allSatisfied: boolean } {
  if (pending.length === 0) {
    return { reactions, allSatisfied: true };
  }
  let current = reactions;
  let allSatisfied = true;
  for (const tx of pending) {
    const intent: PendingReactionToggleIntent = {
      emoji: tx.emoji,
      userId: tx.userId,
      removing: tx.removing,
      previousReactions: tx.previousReactions,
    };
    if (reactionSnapshotSatisfiesPendingIntent(current, intent)) continue;
    allSatisfied = false;
    current = applyPendingReactionIntent(current, intent);
  }
  return { reactions: current, allSatisfied };
}
