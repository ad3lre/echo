import type { MessageReaction } from './types/message';

/** True when the server omitted per-user ids on a socket fan-out (counts only). */
export function isMessageReactionFanoutSummary(
  reaction: MessageReaction,
): boolean {
  return reaction.count > 0 && reaction.userIds.length === 0;
}

/**
 * Strip reactor ids for channel-wide socket fan-out. REST/history responses keep full rows.
 * Contract v1 shape is preserved (`userIds` present but empty when count > 0).
 */
export function toMessageReactionFanoutPayload(
  reactions: MessageReaction[],
): MessageReaction[] {
  return reactions.map((r) => ({
    emoji: r.emoji,
    count: r.count,
    userIds: [],
    ...(r.firstReactionAt ? { firstReactionAt: r.firstReactionAt } : {}),
  }));
}

/**
 * Merge a count-only fan-out snapshot with existing client state so the viewer's own
 * highlight survives when `userIds` were omitted on the wire.
 */
export function mergeFanoutMessageReactions(
  existing: MessageReaction[] | undefined,
  incoming: MessageReaction[],
  viewerUserId: string | undefined,
): MessageReaction[] {
  if (!viewerUserId?.trim()) return incoming;
  const viewerId = viewerUserId.trim();
  const existingByEmoji = new Map(
    (existing ?? []).map((r) => [r.emoji, r] as const),
  );
  return incoming.map((inc) => {
    if (!isMessageReactionFanoutSummary(inc)) return inc;
    const prev = existingByEmoji.get(inc.emoji);
    const viewerHad = prev?.userIds.includes(viewerId) ?? false;
    if (!viewerHad || inc.count <= 0) return inc;
    return { ...inc, userIds: [viewerId] };
  });
}
