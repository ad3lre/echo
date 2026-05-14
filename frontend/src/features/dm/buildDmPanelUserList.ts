/**
 * Builds the 1:1 DM inbox rows for {@link DMPanel} (Messages tab).
 * Sources: persisted Echo DM map, legacy `dm-{userId}` channels with message history,
 * and the currently selected peer (e.g. opened from a profile) so they appear immediately.
 */

import { peerDisplayNamePlaceholder } from '@/features/dm/peerDisplayPlaceholder';
import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import { rawMessageOrderingTimeMs } from '@/services/realtime/channelMessageOrder';
import { parseSnowflakeTime } from '@shared/snowflakeIds';

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

export type ActivityRank = {
  messageTime: number;
  activityId: string;
};

function compareNumericStringDesc(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  try {
    const ai = BigInt(a);
    const bi = BigInt(b);
    if (ai === bi) return 0;
    return ai > bi ? -1 : 1;
  } catch {
    return b.localeCompare(a);
  }
}

export function compareActivityRankDesc(
  a: ActivityRank,
  b: ActivityRank,
): number {
  // Prefer wall-clock / loaded history when both threads have it.
  const aAct = a.activityId;
  const bAct = b.activityId;
  if (
    a.messageTime > 0 &&
    b.messageTime > 0 &&
    a.messageTime !== b.messageTime
  ) {
    return b.messageTime - a.messageTime;
  }
  // Only compare raw activity ids when neither side has a resolved time — avoids letting
  // numeric id ordering beat a thread that has real local messages (e.g. just sent).
  if (
    a.messageTime === 0 &&
    b.messageTime === 0 &&
    aAct &&
    bAct &&
    aAct !== bAct
  ) {
    return compareNumericStringDesc(aAct, bAct);
  }
  if (a.messageTime !== b.messageTime) return b.messageTime - a.messageTime;
  return compareNumericStringDesc(aAct, bAct);
}

function parseMessageTime(timestamp?: string): number {
  if (!timestamp) return 0;
  const t = new Date(timestamp).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function approxMsFromEchoActivityId(activityId: string): number {
  const d = parseSnowflakeTime(activityId.trim());
  return d ? d.getTime() : 0;
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
  activityIdByChannelId?: ReadonlyMap<string, string>;
  /** Optional trusted timestamp when message list is unavailable for this surface. */
  fallbackLastMessageAt?: string;
  getMessages?: (channelId: string) => readonly MsgLike[] | undefined;
}): ActivityRank {
  const {
    channelId,
    activityIdByChannelId,
    fallbackLastMessageAt,
    getMessages,
  } = input;
  const listMessageTime = getMessages
    ? latestMessageTimeForChannel(channelId, getMessages)
    : 0;
  const fallbackMessageTime = parseMessageTime(fallbackLastMessageAt);
  const actId = activityIdByChannelId?.get(channelId)?.trim() ?? '';
  const fromActivityId = actId ? approxMsFromEchoActivityId(actId) : 0;
  return {
    messageTime: Math.max(listMessageTime, fallbackMessageTime, fromActivityId),
    activityId: actId,
  };
}

function latestTimeForPeerMessage(
  peerId: string,
  messageKeys: readonly string[],
  echoPeerByChannelId: ReadonlyMap<string, string>,
  getMessages: (channelId: string) => readonly MsgLike[] | undefined,
  activityIdByChannelId: ReadonlyMap<string, string>,
): ActivityRank {
  let rank: ActivityRank = { messageTime: 0, activityId: '' };
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
      activityIdByChannelId,
      getMessages,
    });
    if (compareActivityRankDesc(next, rank) < 0) {
      rank = next;
    }
  }
  return rank;
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
  activityIdByChannelId?: ReadonlyMap<string, string>;
  messageKeys: string[];
  getMessages: (channelId: string) => readonly MsgLike[] | undefined;
  usersById: ReadonlyMap<string, UserLike>;
  selectedDmUserId: string | null;
}): DmPanelUserRow[] {
  const {
    selfId,
    echoPeerByChannelId,
    activityIdByChannelId = new Map<string, string>(),
    messageKeys,
    getMessages,
    usersById,
    selectedDmUserId,
  } = input;

  const peerIds = new Set<string>();
  for (const peer of echoPeerByChannelId.values()) {
    if (peer && peer !== selfId) peerIds.add(peer);
  }
  for (const channelId of messageKeys) {
    const p = dmPeerUserIdFromChannelId(channelId, echoPeerByChannelId);
    if (p && p !== selfId) peerIds.add(p);
  }
  if (selectedDmUserId && selectedDmUserId !== selfId) {
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
      latestTimeForPeerMessage(
        id,
        messageKeys,
        echoPeerByChannelId,
        getMessages,
        activityIdByChannelId,
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
 * 1:1 + group DM rows for the Messages tab, sorted by latest activity (same basis as 1:1-only list).
 */
export function buildDmPanelInboxList(input: {
  selfId: string;
  echoPeerByChannelId: ReadonlyMap<string, string>;
  activityIdByChannelId?: ReadonlyMap<string, string>;
  messageKeys: string[];
  getMessages: (channelId: string) => readonly MsgLike[] | undefined;
  usersById: ReadonlyMap<string, UserLike>;
  selectedDmUserId: string | null;
  groups: readonly { id: string; name: string; pfp: string }[];
  /** Active shell channel id (legacy `dm-*`, snowflake thread id, etc.). */
  activeInboxChannelId: string;
  /** From `attention:update` - keyed by DM / group DM channel id. */
  dmUnreadByChannelId?: ReadonlyMap<string, number>;
}): DmPanelInboxEntry[] {
  const userRows = buildDmPanelUserList({
    selfId: input.selfId,
    echoPeerByChannelId: input.echoPeerByChannelId,
    activityIdByChannelId: input.activityIdByChannelId,
    messageKeys: input.messageKeys,
    getMessages: input.getMessages,
    usersById: input.usersById,
    selectedDmUserId: input.selectedDmUserId,
  });

  const activityIdByChannelId =
    input.activityIdByChannelId ?? new Map<string, string>();
  type Stamped = { entry: DmPanelInboxEntry; rank: ActivityRank; name: string };
  const stamped: Stamped[] = [];

  for (const row of userRows) {
    const rank = latestTimeForPeerMessage(
      row.id,
      input.messageKeys,
      input.echoPeerByChannelId,
      input.getMessages,
      activityIdByChannelId,
    );
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
    const rank = activityRankForChannel({
      channelId: g.id,
      activityIdByChannelId,
      getMessages: input.getMessages,
    });
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
