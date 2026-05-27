import type {
  EchoAttentionChannelSummary,
  EchoAttentionPingKind,
  EchoServerNotificationLevel,
  MentionEntity,
  ReplyTo,
} from './types';

const PING_RANK: Record<EchoAttentionPingKind, number> = {
  personal: 3,
  role: 2,
  broadcast: 1,
};

export function mergeAttentionPingKinds(
  a: EchoAttentionPingKind | null,
  b: EchoAttentionPingKind | null,
): EchoAttentionPingKind | null {
  if (!a) return b;
  if (!b) return a;
  return PING_RANK[a] >= PING_RANK[b] ? a : b;
}

/** True when this message is a reply to the given user (Discord-style reply ping). */
export function messageRepliesToUser(
  replyTo: ReplyTo | undefined,
  replyTargetAuthorId: string | undefined,
  userId: string | undefined,
): boolean {
  const uid = userId?.trim();
  if (!uid || !replyTo?.messageId?.trim()) return false;
  const fromSnapshot = replyTo.authorId?.trim();
  if (fromSnapshot) return fromSnapshot === uid;
  const fromTarget = replyTargetAuthorId?.trim();
  return fromTarget === uid;
}

export function classifyAttentionPingKind(
  mentions: MentionEntity[] | undefined,
  opts: {
    userId?: string;
    /** Account username — matched against mention label when ids are absent. */
    username?: string;
    /** Display name — mention picker often labels with display name, not login. */
    displayName?: string;
    memberRoleIds?: Set<string>;
  },
): EchoAttentionPingKind | null {
  if (!mentions?.length) return null;
  let best: EchoAttentionPingKind | null = null;
  for (const mention of mentions) {
    if (mention.kind === 'channel') continue;
    if (mention.kind === 'user') {
      if (opts.userId) {
        const uid = opts.userId.trim();
        const byUserId = mention.userId?.trim() === uid;
        /** Some payloads put the target user id on `id` (see collectDmMentionNotifications). */
        const byEntityId =
          typeof mention.id === 'string' && mention.id.trim() === uid;
        if (byUserId || byEntityId) {
          best = mergeAttentionPingKinds(best, 'personal');
          continue;
        }
      }
      const labelLow = mention.label.trim().toLowerCase();
      const labelCandidates = [opts.username, opts.displayName].filter(
        (x): x is string => typeof x === 'string' && x.trim().length > 0,
      );
      if (
        labelLow &&
        labelCandidates.some((c) => c.trim().toLowerCase() === labelLow)
      ) {
        best = mergeAttentionPingKinds(best, 'personal');
      }
      continue;
    }
    if (mention.kind === 'role') {
      if (!mention.roleId?.trim()) continue;
      if (
        opts.memberRoleIds === undefined ||
        opts.memberRoleIds.has(mention.roleId.trim())
      ) {
        best = mergeAttentionPingKinds(best, 'role');
      }
      continue;
    }
    if (mention.kind === 'everyone' || mention.kind === 'active') {
      best = mergeAttentionPingKinds(best, 'broadcast');
    }
  }
  return best;
}

export function applyAttentionNotificationLevel(
  level: EchoServerNotificationLevel,
  pingKind: EchoAttentionPingKind | null,
): EchoAttentionPingKind | null {
  if (!pingKind) return null;
  if (level === 'none') return null;
  if (level === 'mentions_direct') {
    return pingKind === 'personal' ? 'personal' : null;
  }
  return pingKind;
}

/** Rail badge: strongest ping tier that has unread volume, with summed unreads (capped for display). */
export type ServerPingBubbleDisplay = {
  kind: EchoAttentionPingKind;
  /** Sum of unread counts for channels in this tier; UI caps at 99. */
  count: number;
};

/** Same ordering as Echo read cursors (numeric snowflakes vs lexicographic UUIDs). */
function compareEchoTimelineIds(a: string, b: string): number {
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
 * Upper bound message id for "have we read past all unreads?" comparisons.
 * Prefers `latestUnreadMessageId`; when it is absent but there is exactly one
 * unread, `firstUnreadMessageId` is equivalent (common with partial/mock payloads).
 */
export function resolveEchoUnreadUpperBoundMessageId(
  summary: EchoAttentionChannelSummary,
): string {
  const latest = summary.latestUnreadMessageId?.trim() ?? '';
  if (latest) return latest;
  const first = summary.firstUnreadMessageId?.trim() ?? '';
  if (first && summary.unreadCount === 1) return first;
  return '';
}

/**
 * Whether a channel still contributes to mention/ping badges given the effective read cursor.
 * Matches `echoAttention` / mark-as-read: advancing the cursor past `latestUnreadMessageId`
 * clears pings even if `unreadCount` in the snapshot is briefly stale.
 */
export function isServerChannelUnreadForPingBubble(
  summary: EchoAttentionChannelSummary,
  lastReadMessageId: string | null | undefined,
): boolean {
  if (summary.kind !== 'server' || !summary.serverId) return false;
  if (summary.unreadCount <= 0) return false;
  const boundary = resolveEchoUnreadUpperBoundMessageId(summary);
  if (!boundary) {
    const lr = String(lastReadMessageId ?? '').trim();
    const stored = String(summary.lastReadMessageId ?? '').trim();
    if (lr && stored && compareEchoTimelineIds(lr, stored) >= 0) {
      return false;
    }
    // No id to compare against the cursor — treat as unread if volume says so.
    return summary.unreadCount > 0;
  }
  const lr = String(lastReadMessageId ?? '').trim();
  if (!lr) return true;
  return compareEchoTimelineIds(lr, boundary) < 0;
}

/**
 * DM thread: unread volume that still counts as a mention/ping (e.g. @user in the DM),
 * using the same read-cursor vs. latest-unread boundary rule as server channels.
 */
export function isDmChannelMentionUnread(
  summary: EchoAttentionChannelSummary,
  lastReadMessageId: string | null | undefined,
): boolean {
  if (summary.kind !== 'dm' || !summary.pingKind) return false;
  if (summary.unreadCount <= 0) return false;
  const boundary = resolveEchoUnreadUpperBoundMessageId(summary);
  if (!boundary) {
    return summary.unreadCount > 0;
  }
  const lr = String(lastReadMessageId ?? '').trim();
  if (!lr) return true;
  return compareEchoTimelineIds(lr, boundary) < 0;
}

/**
 * Aggregate per-channel unread counts into one bubble for the server rail:
 * chooses personal > role > broadcast when multiple tiers have unreads.
 */
/** One server-rail dot: a channel that still has mention-tier unread volume. */
export type ServerPingChannelDotDisplay = {
  channelId: string;
  kind: EchoAttentionPingKind;
  unreadCount: number;
};

/**
 * Channels on a server that contribute to mention/ping rail state, after
 * notification overrides and effective read cursors (same rules as the bubble).
 */
export function listServerPingChannelDotsForServer(input: {
  channelSummaries: EchoAttentionChannelSummary[];
  serverId: string;
  notificationLevel: EchoServerNotificationLevel | undefined;
  readStateByChannelId?: Record<string, string | null | undefined>;
}): ServerPingChannelDotDisplay[] {
  const level = input.notificationLevel ?? 'mentions';
  const readMap = input.readStateByChannelId;
  const dots: ServerPingChannelDotDisplay[] = [];

  for (const ch of input.channelSummaries) {
    if (ch.kind !== 'server' || ch.serverId !== input.serverId) continue;
    if (ch.unreadCount <= 0) continue;
    const effectiveRead =
      readMap && readMap[ch.channelId] !== undefined
        ? readMap[ch.channelId]
        : ch.lastReadMessageId;
    if (!isServerChannelUnreadForPingBubble(ch, effectiveRead ?? null)) {
      continue;
    }
    const raw = ch.pingKind ?? null;
    const effective = applyAttentionNotificationLevel(level, raw);
    if (!effective) continue;
    dots.push({
      channelId: ch.channelId,
      kind: effective,
      unreadCount: ch.unreadCount,
    });
  }

  dots.sort((a, b) => a.channelId.localeCompare(b.channelId));
  return dots;
}

/**
 * True when the channel still has unread volume that does **not** produce a mention
 * badge at the member’s notification level (e.g. normal messages in “All messages”,
 * or mentions suppressed by “Only @mentions”).
 */
export function isServerChannelPlainUnread(input: {
  summary: EchoAttentionChannelSummary;
  notificationLevel: EchoServerNotificationLevel | undefined;
  readStateByChannelId?: Record<string, string | null | undefined>;
}): boolean {
  const ch = input.summary;
  if (ch.kind !== 'server' || !ch.serverId) return false;
  const readMap = input.readStateByChannelId;
  const effectiveRead =
    readMap && readMap[ch.channelId] !== undefined
      ? readMap[ch.channelId]
      : ch.lastReadMessageId;
  if (!isServerChannelUnreadForPingBubble(ch, effectiveRead ?? null)) {
    return false;
  }
  const level = input.notificationLevel ?? 'mentions';
  const raw = ch.pingKind ?? null;
  const effective = applyAttentionNotificationLevel(level, raw);
  return effective === null;
}

/** Per-server: show compact white activity indicator on the rail (non-mention unreads). */
export function computeServerUnreadActivityDotByServerId(input: {
  channelSummaries: EchoAttentionChannelSummary[];
  readStateByChannelId?: Record<string, string | null | undefined>;
  serverNotificationLevelByServerId: Record<
    string,
    EchoServerNotificationLevel | undefined
  >;
}): Record<string, true> {
  const out: Record<string, true> = {};
  const levels = input.serverNotificationLevelByServerId;
  for (const ch of input.channelSummaries) {
    if (ch.kind !== 'server' || !ch.serverId?.trim()) continue;
    if (
      !isServerChannelPlainUnread({
        summary: ch,
        notificationLevel: levels[ch.serverId],
        readStateByChannelId: input.readStateByChannelId,
      })
    ) {
      continue;
    }
    out[ch.serverId] = true;
  }
  return out;
}

/**
 * Channels in guilds that still have unread messages (mentions or not), for sidebar emphasis.
 */
export function computeChannelMissedActivityByChannelId(input: {
  channelSummaries: EchoAttentionChannelSummary[];
  readStateByChannelId?: Record<string, string | null | undefined>;
}): Record<string, true> {
  const out: Record<string, true> = {};
  const readMap = input.readStateByChannelId;
  for (const ch of input.channelSummaries) {
    if (ch.kind !== 'server') continue;
    const effectiveRead =
      readMap && readMap[ch.channelId] !== undefined
        ? readMap[ch.channelId]
        : ch.lastReadMessageId;
    if (isServerChannelUnreadForPingBubble(ch, effectiveRead ?? null)) {
      out[ch.channelId] = true;
    }
  }
  return out;
}

export function computeServerPingBubbleForServer(input: {
  channelSummaries: EchoAttentionChannelSummary[];
  serverId: string;
  /** When omitted, behaves like `mentions` (all mention classes). */
  notificationLevel: EchoServerNotificationLevel | undefined;
  /**
   * Local read cursors (and API responses). When set, channels whose cursor is
   * already at/after `latestUnreadMessageId` are excluded — same as server attention.
   */
  readStateByChannelId?: Record<string, string | null | undefined>;
}): ServerPingBubbleDisplay | null {
  const level = input.notificationLevel ?? 'mentions';
  const readMap = input.readStateByChannelId;
  const buckets: Record<EchoAttentionPingKind, number> = {
    personal: 0,
    role: 0,
    broadcast: 0,
  };

  for (const ch of input.channelSummaries) {
    if (ch.kind !== 'server' || ch.serverId !== input.serverId) continue;
    if (ch.unreadCount <= 0) continue;
    const effectiveRead =
      readMap && readMap[ch.channelId] !== undefined
        ? readMap[ch.channelId]
        : ch.lastReadMessageId;
    if (!isServerChannelUnreadForPingBubble(ch, effectiveRead ?? null)) {
      continue;
    }
    const raw = ch.pingKind ?? null;
    const effective = applyAttentionNotificationLevel(level, raw);
    if (!effective) continue;
    buckets[effective] += ch.unreadCount;
  }

  const order: EchoAttentionPingKind[] = ['personal', 'role', 'broadcast'];
  for (const kind of order) {
    const n = buckets[kind];
    if (n > 0) {
      return { kind, count: Math.min(99, n) };
    }
  }
  return null;
}
