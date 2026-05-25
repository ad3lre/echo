/**
 * Builds the 1:1 DM inbox rows for {@link DMPanel} (Messages tab).
 *
 * Ordering rule (single, no exceptions): rows are sorted by **`lastActivityAt` desc**.
 * `lastActivityAt` is the server's authoritative DM-activity timestamp from
 * `echo_dm_activity.last_activity_at`: bumped on message persist, DM call signaling,
 * friend accept (between the pair), and group events. We do not mix in snowflake-derived
 * times, message-list timestamps, or any other clock — those produced the
 * "list disagrees with itself" behaviour the v2 rebuild was designed to fix.
 *
 * Local message arrival also drives a `messageTime` fallback so optimistic sends move
 * the row to the top instantly; the server `dm:activity` re-emit then converges everyone.
 *
 * Sources of membership (NOT of ordering): persisted Echo DM map, legacy `dm-{userId}`
 * channels with message history, and the currently selected peer (e.g. opened from a
 * profile) so they appear immediately.
 */

import { peerDisplayNamePlaceholder } from '@/features/dm/peerDisplayPlaceholder';
import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import { rawMessageOrderingTimeMs } from '@/services/realtime/channelMessageOrder';

export type DmPanelUserRow = {
  id: string;
  name: string;
  pfp: string;
  status?: string;
  customStatus?: string;
};

type UserLike = {
  id: string;
  name: string;
  pfp: string;
  status?: string;
  customStatus?: string;
};

type MsgLike = { timestamp?: string };

/**
 * Single, monotonic sort key (ms epoch). 0 means "no known activity"; such rows sort
 * to the bottom, broken alphabetically. Callers should rarely see 0 because the server
 * inserts an `echo_dm_activity` row on thread creation (`/dm/open`).
 */
export type ActivityRank = { ms: number };

const ZERO_RANK: ActivityRank = { ms: 0 };

const SELF_DM_INBOX_SORT_RANK_MS = Number.MAX_SAFE_INTEGER;

export function compareActivityRankDesc(
  a: ActivityRank,
  b: ActivityRank,
): number {
  if (a.ms === b.ms) return 0;
  return b.ms - a.ms;
}

function latestMessageTimeForChannel(
  channelId: string,
  getMessages: (channelId: string) => readonly MsgLike[] | undefined,
): number {
  const list = getMessages(channelId);
  if (!list?.length) return 0;
  const last = list[list.length - 1] as RawMessage;
  const t = rawMessageOrderingTimeMs(last);
  return t != null && Number.isFinite(t) ? t : 0;
}

export function activityRankForChannel(input: {
  channelId: string;
  /** Server-authoritative ms epoch per channel. */
  lastActivityAtMsByChannelId?: ReadonlyMap<string, number>;
  getMessages?: (channelId: string) => readonly MsgLike[] | undefined;
}): ActivityRank {
  const { channelId, lastActivityAtMsByChannelId, getMessages } = input;
  const fromServer = lastActivityAtMsByChannelId?.get(channelId) ?? 0;
  // Local message arrival ahead of the server `dm:activity` re-emit: keep parity so
  // optimistic sends move the row to top immediately. Server bumps converge later.
  const fromLocal = getMessages
    ? latestMessageTimeForChannel(channelId, getMessages)
    : 0;
  const ms = Math.max(fromServer, fromLocal);
  return ms > 0 ? { ms } : ZERO_RANK;
}

export function activityRankForPeerUser(
  peerId: string,
  messageKeys: readonly string[],
  echoPeerByChannelId: ReadonlyMap<string, string>,
  getMessages: (channelId: string) => readonly MsgLike[] | undefined,
  lastActivityAtMsByChannelId: ReadonlyMap<string, number>,
): ActivityRank {
  let best = 0;
  const candidateChannelIds = new Set<string>([
    ...messageKeys,
    ...echoPeerByChannelId.keys(),
  ]);
  for (const channelId of candidateChannelIds) {
    if (dmPeerUserIdFromChannelId(channelId, echoPeerByChannelId) !== peerId) {
      continue;
    }
    const next = activityRankForChannel({
      channelId,
      lastActivityAtMsByChannelId,
      getMessages,
    });
    if (next.ms > best) best = next.ms;
  }
  return best > 0 ? { ms: best } : ZERO_RANK;
}

export function dmPeerUserIdFromChannelId(
  channelId: string,
  echoPeerByChannelId: ReadonlyMap<string, string>,
): string | null {
  if (channelId.startsWith('dm-group-')) return null;
  if (channelId.startsWith('dm-')) {
    const id = channelId.slice('dm-'.length);
    return id || null;
  }
  return echoPeerByChannelId.get(channelId) ?? null;
}

/** Snowflake (or other) DM channel id for a 1:1 peer from the Echo map - excludes group threads. */
export function echoDmChannelIdForPeerUser(
  peerUserId: string,
  echoPeerByChannelId: ReadonlyMap<string, string>,
): string | null {
  for (const [channelId, peerId] of echoPeerByChannelId) {
    if (channelId.startsWith('dm-group-')) continue;
    if (peerId === peerUserId) return channelId;
  }
  return null;
}

function dmUnreadCountForPeerUser(
  peerUserId: string,
  echoPeerByChannelId: ReadonlyMap<string, string>,
  dmUnreadByChannelId: ReadonlyMap<string, number> | undefined,
): number {
  if (!dmUnreadByChannelId?.size) return 0;
  const echoCh = echoDmChannelIdForPeerUser(peerUserId, echoPeerByChannelId);
  if (echoCh) {
    const n = dmUnreadByChannelId.get(echoCh);
    if (n != null && n > 0) return n;
  }
  const legacy = `dm-${peerUserId}`;
  return dmUnreadByChannelId.get(legacy) ?? 0;
}

export function buildDmPanelUserList(input: {
  selfId: string;
  echoPeerByChannelId: ReadonlyMap<string, string>;
  /** Server-authoritative ms epoch per channel id. The ONLY ordering source. */
  lastActivityAtMsByChannelId?: ReadonlyMap<string, number>;
  messageKeys: string[];
  getMessages: (channelId: string) => readonly MsgLike[] | undefined;
  usersById: ReadonlyMap<string, UserLike>;
  selectedDmUserId: string | null;
}): DmPanelUserRow[] {
  const {
    selfId,
    echoPeerByChannelId,
    lastActivityAtMsByChannelId = new Map<string, number>(),
    messageKeys,
    getMessages,
    usersById,
    selectedDmUserId,
  } = input;

  const me = selfId.trim();
  const peerIds = new Set<string>();
  for (const peer of echoPeerByChannelId.values()) {
    if (peer && peer !== me) peerIds.add(peer);
  }
  for (const channelId of messageKeys) {
    const p = dmPeerUserIdFromChannelId(channelId, echoPeerByChannelId);
    if (p && p !== me) peerIds.add(p);
  }
  if (selectedDmUserId && selectedDmUserId.trim() !== me) {
    peerIds.add(selectedDmUserId);
  }

  const rows: DmPanelUserRow[] = [...peerIds].map((id) => {
    const u = usersById.get(id);
    if (u) {
      return {
        id: u.id,
        name: u.name,
        pfp: u.pfp,
        status: u.status,
        customStatus: u.customStatus,
      };
    }
    return {
      id,
      name: peerDisplayNamePlaceholder(id),
      pfp: '',
    };
  });

  const ranks = new Map<string, ActivityRank>();
  for (const id of peerIds) {
    ranks.set(
      id,
      activityRankForPeerUser(
        id,
        messageKeys,
        echoPeerByChannelId,
        getMessages,
        lastActivityAtMsByChannelId,
      ),
    );
  }

  rows.sort((a, b) => {
    const ta = ranks.get(a.id)!;
    const tb = ranks.get(b.id)!;
    const byActivity = compareActivityRankDesc(ta, tb);
    if (byActivity !== 0) return byActivity;
    return a.name.localeCompare(b.name);
  });

  return rows;
}

export type DmPanelInboxUserEntry = DmPanelUserRow & {
  kind: 'user';
  /** Server attention: unread messages in this DM while not the active thread (UI may hide when open). */
  unreadDmCount?: number;
};
export type DmPanelInboxGroupEntry = {
  kind: 'group';
  id: string;
  name: string;
  pfp: string;
  unreadDmCount?: number;
};
export type DmPanelInboxEntry = DmPanelInboxUserEntry | DmPanelInboxGroupEntry;

/**
 * 1:1 + group DM rows for the Messages tab, sorted by **`lastActivityAt` desc** only.
 * See module-level docstring for the activity-source policy.
 */
export function buildDmPanelInboxList(input: {
  selfId: string;
  echoPeerByChannelId: ReadonlyMap<string, string>;
  /** Server-authoritative ms epoch per channel id. The ONLY ordering source. */
  lastActivityAtMsByChannelId?: ReadonlyMap<string, number>;
  messageKeys: string[];
  getMessages: (channelId: string) => readonly MsgLike[] | undefined;
  usersById: ReadonlyMap<string, UserLike>;
  selectedDmUserId: string | null;
  groups: readonly { id: string; name: string; pfp: string }[];
  /** Active shell channel id (legacy `dm-*`, snowflake thread id, etc.). */
  activeInboxChannelId: string;
  /** From `attention:update` - keyed by DM / group DM channel id. */
  dmUnreadByChannelId?: ReadonlyMap<string, number>;
  /**
   * Persisted cold-start fallback ms-epoch timestamps from the last rendered order,
   * keyed by peer user id (1:1) and channel id (group). Used ONLY before any live
   * activity data has arrived, so cold start renders in real chronological order
   * rather than alphabetical / arbitrary.
   */
  fallbackRankMsByKey?: ReadonlyMap<string, number>;
}): DmPanelInboxEntry[] {
  const userRows = buildDmPanelUserList({
    selfId: input.selfId,
    echoPeerByChannelId: input.echoPeerByChannelId,
    lastActivityAtMsByChannelId: input.lastActivityAtMsByChannelId,
    messageKeys: input.messageKeys,
    getMessages: input.getMessages,
    usersById: input.usersById,
    selectedDmUserId: input.selectedDmUserId,
  });

  const lastActivityAtMsByChannelId =
    input.lastActivityAtMsByChannelId ?? new Map<string, number>();
  type Stamped = { entry: DmPanelInboxEntry; rank: ActivityRank; name: string };
  const stamped: Stamped[] = [];

  const fallback = input.fallbackRankMsByKey;

  const selfTrim = input.selfId?.trim() ?? '';
  if (selfTrim) {
    const uSelf = input.usersById.get(selfTrim);
    const selfUnread = dmUnreadCountForPeerUser(
      selfTrim,
      input.echoPeerByChannelId,
      input.dmUnreadByChannelId,
    );
    stamped.push({
      entry: {
        kind: 'user',
        id: selfTrim,
        name: 'You',
        pfp: uSelf?.pfp ?? '',
        ...(uSelf?.status ? { status: uSelf.status } : {}),
        ...(uSelf?.customStatus ? { customStatus: uSelf.customStatus } : {}),
        ...(selfUnread > 0 ? { unreadDmCount: selfUnread } : {}),
      },
      rank: { ms: SELF_DM_INBOX_SORT_RANK_MS },
      name: 'You',
    });
  }

  for (const row of userRows) {
    const liveRank = activityRankForPeerUser(
      row.id,
      input.messageKeys,
      input.echoPeerByChannelId,
      input.getMessages,
      lastActivityAtMsByChannelId,
    );
    // Apply persisted fallback only when no live data has arrived for this peer yet.
    const rank: ActivityRank =
      liveRank.ms === 0 && fallback
        ? { ms: fallback.get(row.id) ?? 0 }
        : liveRank;
    const unreadDmCount = dmUnreadCountForPeerUser(
      row.id,
      input.echoPeerByChannelId,
      input.dmUnreadByChannelId,
    );
    stamped.push({
      entry: {
        kind: 'user',
        ...row,
        ...(unreadDmCount > 0 ? { unreadDmCount } : {}),
      },
      rank,
      name: row.name,
    });
  }

  for (const g of input.groups) {
    const liveRank = activityRankForChannel({
      channelId: g.id,
      lastActivityAtMsByChannelId,
      getMessages: input.getMessages,
    });
    const rank: ActivityRank =
      liveRank.ms === 0 && fallback
        ? { ms: fallback.get(g.id) ?? 0 }
        : liveRank;
    const gUnread = input.dmUnreadByChannelId?.get(g.id) ?? 0;
    stamped.push({
      entry: {
        kind: 'group',
        id: g.id,
        name: g.name,
        pfp: g.pfp,
        ...(gUnread > 0 ? { unreadDmCount: gUnread } : {}),
      },
      rank,
      name: g.name,
    });
  }

  stamped.sort((a, b) => {
    const byActivity = compareActivityRankDesc(a.rank, b.rank);
    if (byActivity !== 0) return byActivity;
    return a.name.localeCompare(b.name);
  });

  return stamped.map((s) => s.entry);
}

/**
 * After favorites / visibility ordering, keep the **You** (self-DM) row first (Slack-style).
 */
export function pinSelfDmInboxEntryFirst(
  entries: readonly DmPanelInboxEntry[],
  selfId: string | undefined,
): DmPanelInboxEntry[] {
  const sid = selfId?.trim();
  if (!sid) return [...entries];
  const idx = entries.findIndex((e) => e.kind === 'user' && e.id === sid);
  if (idx <= 0) return [...entries];
  const out = [...entries];
  const [row] = out.splice(idx, 1);
  out.unshift(row);
  return out;
}

/** Matches {@link useAppLayoutMessageActions#getLatestDMUserId} for DM rail "open latest" behavior. */
export function getLatestDmPeerUserId(input: {
  selfId: string;
  echoPeerByChannelId: ReadonlyMap<string, string>;
  messages: Record<string, readonly MsgLike[] | undefined>;
  orderedOtherUserIds: string[];
  /** Excluded peers (e.g. hidden from DM list). */
  skipPeerUserId?: (userId: string) => boolean;
}): string | null {
  const {
    selfId,
    echoPeerByChannelId,
    messages,
    orderedOtherUserIds,
    skipPeerUserId,
  } = input;
  let latestUserId: string | null = null;
  let latestTime = 0;
  for (const [channelId, list] of Object.entries(messages)) {
    if (!list?.length) continue;
    const peerId = dmPeerUserIdFromChannelId(channelId, echoPeerByChannelId);
    if (!peerId || peerId === selfId) continue;
    if (skipPeerUserId?.(peerId)) continue;
    const lastMsg = list[list.length - 1];
    if (!lastMsg?.timestamp) continue;
    const parsed = new Date(lastMsg.timestamp).getTime();
    if (!Number.isNaN(parsed) && parsed > latestTime) {
      latestTime = parsed;
      latestUserId = peerId;
    }
  }
  if (latestUserId) return latestUserId;
  return (
    orderedOtherUserIds.find((id) => id !== selfId && !skipPeerUserId?.(id)) ??
    null
  );
}
