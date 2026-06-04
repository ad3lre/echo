import type pg from 'pg';
import { clampEchoChannelName } from '../../../../shared/echoChannelLimits';
import { validateEchoStoredBrandingUrl } from '../../services/storedMediaUrl';
import type { EchoDmRealtimeThread } from '../../../../shared/types';
import {
  queryEchoDmThreadsForUser,
  selectEchoDmMessageRequestsPendingPreviewRows,
  selectEchoDmDirectThreadRowForCallSignal,
  selectEchoDmRealtimeDirectThreadRow,
  selectEchoDmRealtimeGroupThreadRow,
} from '../echoMessagesDal';
import { nextEchoSnowflakeId } from '../echoSnowflake';
import { getEchoEntitlements } from '../echoPlanEntitlements';
import { isEchoPairBlocked } from './blocks';
import {
  areEchoAcceptedFriends,
  echoUsersShareAnyServer,
  filterVisibleEchoUserIds,
} from './social';

type SqlExecutor = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

/** True when a persisted 1:1 DM thread row exists between the two users. */
export async function echoUsersShareDirectDm(
  pool: pg.Pool,
  userIdA: string,
  userIdB: string,
): Promise<boolean> {
  return (await getEchoDmChannelIdForPair(pool, userIdA, userIdB)) != null;
}

/** Channel id of the persisted 1:1 DM thread between two users, or null when none exists. */
export async function getEchoDmChannelIdForPair(
  pool: pg.Pool,
  userIdA: string,
  userIdB: string,
): Promise<string | null> {
  const a = userIdA.trim();
  const b = userIdB.trim();
  if (!a || !b) return null;
  if (a === b) {
    const selfRow = await pool.query<{ channel_id: string }>(
      `
      SELECT channel_id
      FROM echo_dm_threads
      WHERE user_low = $1 AND user_high = $1
      LIMIT 1
      `,
      [a],
    );
    const row = selfRow.rows[0];
    return row ? String(row.channel_id) : null;
  }
  const low = a < b ? a : b;
  const high = a < b ? b : a;
  const r = await pool.query<{ channel_id: string }>(
    `
    SELECT channel_id
    FROM echo_dm_threads
    WHERE user_low = $1 AND user_high = $2
    LIMIT 1
    `,
    [low, high],
  );
  const row = r.rows[0];
  return row ? String(row.channel_id) : null;
}

/**
 * True when two users may participate in a DM thread: accepted friends, or members of at least
 * one mutual non-DM-realm server. Does not check blocks.
 */
export async function echoPairMayParticipateInDm(
  pool: pg.Pool,
  userId: string,
  peerId: string,
): Promise<boolean> {
  if (userId === peerId) return false;
  if (await areEchoAcceptedFriends(pool, userId, peerId)) return true;
  return echoUsersShareAnyServer(pool, userId, peerId);
}

/** Synthetic server that holds persisted 1:1 DM channels; hidden from workspace server lists (no membership rows). */
export const ECHO_DM_REALM_SERVER_ID = 'echo_dm_realm';

export const ECHO_GROUP_DM_MIN_MEMBERS = 3;

export type EchoDmActivityKind =
  | 'open'
  | 'message'
  | 'call'
  | 'friend'
  | 'group_event';

/**
 * Bump the authoritative DM-thread activity timestamp. Monotonic forward: stale events
 * (older than what is already stored) are ignored so out-of-order signals never reorder
 * the inbox backward. Returns the effective stored timestamp (ISO string) or null if
 * the channel has no activity row (i.e. not a DM-realm channel).
 *
 * Always idempotent: writing the same timestamp twice is a no-op.
 */
export async function bumpEchoDmThreadActivity(
  db: SqlExecutor,
  channelId: string,
  at: string | Date,
  kind: EchoDmActivityKind,
): Promise<string | null> {
  const cid = channelId.trim();
  if (!cid) return null;
  const r = await db.query<{ last_activity_at: Date }>(
    `
    INSERT INTO echo_dm_activity (channel_id, last_activity_at, last_activity_kind)
    VALUES ($1, $2, $3)
    ON CONFLICT (channel_id) DO UPDATE
      SET last_activity_at = GREATEST(echo_dm_activity.last_activity_at, EXCLUDED.last_activity_at),
          last_activity_kind = CASE
            WHEN EXCLUDED.last_activity_at >= echo_dm_activity.last_activity_at
              THEN EXCLUDED.last_activity_kind
            ELSE echo_dm_activity.last_activity_kind
          END
    RETURNING last_activity_at
    `,
    [cid, at, kind],
  );
  const row = r.rows[0];
  if (!row) return null;
  return row.last_activity_at instanceof Date
    ? row.last_activity_at.toISOString()
    : new Date(String(row.last_activity_at)).toISOString();
}

export type EchoDmThreadRow = {
  channelId: string;
  peerId: string | null;
  kind: 'direct' | 'group';
  name: string | null;
  memberUserIds: string[] | null;
  lastActivityId: string;
  /** Authoritative inbox sort key. ISO 8601 UTC. Set by any real DM activity (message, call, friend, group). */
  lastActivityAt: string;
  /** Persisted custom group icon (echo_channels.icon_key); null when unset or direct thread. */
  groupPfp: string | null;
};

export type EchoDmMessageRequestStatus = 'pending' | 'accepted' | 'ignored';

export type EchoDmMessageRequestRow = {
  channelId: string;
  requesterUserId: string;
  recipientUserId: string;
  status: EchoDmMessageRequestStatus;
  requestedAt: string;
  respondedAt: string | null;
};

export type EchoDmMessageRequestListRow = {
  id: string;
  channelId: string;
  fromUserId: string;
  preview: string;
};

type EchoDmThreadAccessState = {
  channelId: string;
  status: EchoDmMessageRequestStatus | null;
  requesterUserId: string | null;
  recipientUserId: string | null;
};

type EchoGroupDmPairPolicyResult = 'ok' | 'blocked' | 'not_eligible';

export async function getEchoDmPeerUserId(
  pool: pg.Pool,
  channelId: string,
  userId: string,
): Promise<string | null> {
  const r = await pool.query(
    `SELECT user_low, user_high FROM echo_dm_threads WHERE channel_id = $1`,
    [channelId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const low = String(row.user_low);
  const high = String(row.user_high);
  if (low === high) return low;
  if (userId === low) return high;
  if (userId === high) return low;
  return null;
}

async function getEchoDmThreadAccessStateByPair(
  pool: pg.Pool,
  userId: string,
  peerId: string,
): Promise<EchoDmThreadAccessState | null> {
  const low = userId < peerId ? userId : peerId;
  const high = userId < peerId ? peerId : userId;
  const r = await pool.query(
    `
    SELECT
      d.channel_id,
      mr.status,
      mr.requester_user_id,
      mr.recipient_user_id
    FROM echo_dm_threads d
    LEFT JOIN echo_dm_message_requests mr ON mr.channel_id = d.channel_id
    WHERE d.user_low = $1 AND d.user_high = $2
    LIMIT 1
    `,
    [low, high],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    channelId: String(row.channel_id),
    status:
      row.status === 'pending' ||
      row.status === 'accepted' ||
      row.status === 'ignored'
        ? row.status
        : null,
    requesterUserId:
      row.requester_user_id != null ? String(row.requester_user_id) : null,
    recipientUserId:
      row.recipient_user_id != null ? String(row.recipient_user_id) : null,
  };
}

async function echoPairMayShareGroupDm(
  pool: pg.Pool,
  userId: string,
  peerId: string,
): Promise<boolean> {
  if (await echoPairMayParticipateInDm(pool, userId, peerId)) return true;
  const existing = await getEchoDmThreadAccessStateByPair(pool, userId, peerId);
  return existing?.status === 'accepted';
}

async function validateEchoGroupDmPairPolicy(
  pool: pg.Pool,
  memberUserIds: string[],
  shouldCheckPair: (a: string, b: string) => boolean = () => true,
): Promise<EchoGroupDmPairPolicyResult> {
  for (let i = 0; i < memberUserIds.length; i++) {
    for (let j = i + 1; j < memberUserIds.length; j++) {
      const a = memberUserIds[i]!;
      const b = memberUserIds[j]!;
      if (!shouldCheckPair(a, b)) continue;
      if (await isEchoPairBlocked(pool, a, b)) return 'blocked';
      if (!(await echoPairMayShareGroupDm(pool, a, b))) {
        return 'not_eligible';
      }
    }
  }
  return 'ok';
}

async function getEchoDmMessageRequestByChannelId(
  pool: pg.Pool,
  channelId: string,
): Promise<EchoDmMessageRequestRow | null> {
  const r = await pool.query(
    `
    SELECT channel_id, requester_user_id, recipient_user_id, status, requested_at, responded_at
    FROM echo_dm_message_requests
    WHERE channel_id = $1
    LIMIT 1
    `,
    [channelId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const status =
    row.status === 'pending' ||
    row.status === 'accepted' ||
    row.status === 'ignored'
      ? row.status
      : null;
  if (!status) return null;
  return {
    channelId: String(row.channel_id),
    requesterUserId: String(row.requester_user_id),
    recipientUserId: String(row.recipient_user_id),
    status,
    requestedAt: new Date(row.requested_at as string | Date).toISOString(),
    respondedAt: row.responded_at
      ? new Date(row.responded_at as string | Date).toISOString()
      : null,
  };
}

async function upsertEchoDmMessageRequest(
  db: SqlExecutor,
  channelId: string,
  requesterUserId: string,
  recipientUserId: string,
  status: EchoDmMessageRequestStatus,
): Promise<void> {
  await db.query(
    `
    INSERT INTO echo_dm_message_requests (
      channel_id,
      requester_user_id,
      recipient_user_id,
      status,
      requested_at,
      responded_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      NOW(),
      CASE WHEN $4 = 'pending' THEN NULL ELSE NOW() END
    )
    ON CONFLICT (channel_id) DO UPDATE SET
      requester_user_id = EXCLUDED.requester_user_id,
      recipient_user_id = EXCLUDED.recipient_user_id,
      status = EXCLUDED.status,
      requested_at = CASE
        WHEN EXCLUDED.status = 'pending' THEN NOW()
        ELSE echo_dm_message_requests.requested_at
      END,
      responded_at = CASE
        WHEN EXCLUDED.status = 'pending' THEN NULL
        ELSE NOW()
      END
    `,
    [channelId, requesterUserId, recipientUserId, status],
  );
}

async function markEchoDmMessageRequestAcceptedIfPresent(
  db: SqlExecutor,
  channelId: string,
): Promise<void> {
  await db.query(
    `
    UPDATE echo_dm_message_requests
    SET status = 'accepted',
        responded_at = NOW()
    WHERE channel_id = $1
      AND status <> 'accepted'
    `,
    [channelId],
  );
}

/** True when this channel is a persisted group DM (has `echo_group_dm_members` rows). */
export async function isEchoGroupDmChannel(
  pool: pg.Pool,
  channelId: string,
): Promise<boolean> {
  const cid = channelId.trim();
  if (!cid) return false;
  const r = await pool.query(
    `SELECT 1 FROM echo_group_dm_members WHERE channel_id = $1 LIMIT 1`,
    [cid],
  );
  return r.rows.length > 0;
}

export async function listEchoGroupDmMemberIds(
  pool: pg.Pool,
  channelId: string,
): Promise<string[]> {
  const r = await pool.query(
    `SELECT user_id FROM echo_group_dm_members WHERE channel_id = $1 ORDER BY user_id ASC`,
    [channelId],
  );
  return r.rows.map((row: { user_id: unknown }) => String(row.user_id));
}

export async function listEchoDmParticipantUserIds(
  pool: pg.Pool,
  channelId: string,
): Promise<string[]> {
  const direct = await pool.query(
    `SELECT user_low, user_high FROM echo_dm_threads WHERE channel_id = $1 LIMIT 1`,
    [channelId],
  );
  if (direct.rows[0]) {
    const lo = String(direct.rows[0].user_low);
    const hi = String(direct.rows[0].user_high);
    if (lo === hi) return [lo];
    return [lo, hi];
  }
  return listEchoGroupDmMemberIds(pool, channelId);
}

export async function listEchoDmActiveVoiceParticipantUserIdsByChannelId(
  pool: pg.Pool,
  channelIds: string[],
): Promise<Record<string, string[]>> {
  const ids = [...new Set(channelIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return {};
  const r = await pool.query(
    `
    SELECT channel_id, ARRAY_AGG(user_id ORDER BY joined_at ASC) AS user_ids
    FROM echo_voice_participants
    WHERE server_id = $1
      AND channel_id = ANY($2::text[])
    GROUP BY channel_id
    `,
    [ECHO_DM_REALM_SERVER_ID, ids],
  );
  const out: Record<string, string[]> = {};
  for (const row of r.rows as { channel_id: unknown; user_ids: unknown }[]) {
    const channelId = String(row.channel_id ?? '').trim();
    if (!channelId) continue;
    out[channelId] = Array.isArray(row.user_ids)
      ? row.user_ids.map((id) => String(id)).filter(Boolean)
      : [];
  }
  return out;
}

function isoFromActivityAt(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.toISOString();
  const s = String(value).trim();
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export async function getEchoDmRealtimeThreadForUser(
  pool: pg.Pool,
  channelId: string,
  userId: string,
): Promise<EchoDmRealtimeThread | null> {
  const directRow = await selectEchoDmRealtimeDirectThreadRow(
    pool,
    channelId,
    userId,
  );
  if (directRow) {
    const lastActivityAt = isoFromActivityAt(directRow.last_activity_at);
    return {
      channelId,
      kind: 'direct',
      peerUserId: String(directRow.peer_id),
      lastActivityId: String(directRow.sort_key),
      ...(lastActivityAt ? { lastActivityAt } : {}),
    };
  }

  const groupRow = await selectEchoDmRealtimeGroupThreadRow(
    pool,
    channelId,
    userId,
  );
  if (!groupRow) return null;
  const iconRaw = groupRow.group_icon_key;
  const pfp =
    iconRaw != null && String(iconRaw).trim() ? String(iconRaw).trim() : '';
  const lastActivityAt = isoFromActivityAt(groupRow.last_activity_at);
  return {
    channelId,
    kind: 'group',
    name: String(groupRow.group_name ?? 'Group'),
    memberUserIds: Array.isArray(groupRow.member_ids)
      ? groupRow.member_ids.map((id: unknown) => String(id))
      : [],
    lastActivityId: String(groupRow.sort_key),
    ...(lastActivityAt ? { lastActivityAt } : {}),
    ...(pfp ? { pfp } : {}),
  };
}

/**
 * Thread payload for `dm:call` WebSocket delivery. Uses looser 1:1 rules than
 * `getEchoDmRealtimeThreadForUser` so pending message-request recipients still receive
 * incoming call signals and can ring/answer.
 */
export async function getEchoDmCallSignalThreadForUser(
  pool: pg.Pool,
  channelId: string,
  userId: string,
): Promise<EchoDmRealtimeThread | null> {
  const directRow = await selectEchoDmDirectThreadRowForCallSignal(
    pool,
    channelId,
    userId,
  );
  if (directRow) {
    const lastActivityAt = isoFromActivityAt(directRow.last_activity_at);
    return {
      channelId,
      kind: 'direct',
      peerUserId: String(directRow.peer_id),
      lastActivityId: String(directRow.sort_key),
      ...(lastActivityAt ? { lastActivityAt } : {}),
    };
  }
  return getEchoDmRealtimeThreadForUser(pool, channelId, userId);
}

/**
 * User may join LiveKit for this DM or group-DM channel (1:1: echo_dm_threads;
 * group: echo_group_dm_members + block rules).
 */
export async function userMayJoinDmLiveKitRoom(
  pool: pg.Pool,
  channelId: string,
  userId: string,
): Promise<boolean> {
  if (await isEchoGroupDmChannel(pool, channelId)) {
    return userHasEchoGroupDmAccess(pool, channelId, userId);
  }
  const d1 = await pool.query(
    `SELECT user_low, user_high FROM echo_dm_threads WHERE channel_id = $1`,
    [channelId],
  );
  if (d1.rows[0]) {
    const low = String(d1.rows[0].user_low);
    const high = String(d1.rows[0].user_high);
    if (userId !== low && userId !== high) return false;
    return userHasEchoDirectDmAccess(pool, channelId, userId);
  }
  return userHasEchoGroupDmAccess(pool, channelId, userId);
}

/** Member of group DM channel and not blocked with any other member. */
export async function userHasEchoGroupDmAccess(
  pool: pg.Pool,
  channelId: string,
  userId: string,
): Promise<boolean> {
  const mem = await pool.query(
    `SELECT 1 FROM echo_group_dm_members WHERE channel_id = $1 AND user_id = $2 LIMIT 1`,
    [channelId, userId],
  );
  if (mem.rows.length === 0) return false;

  // Single-query block check to avoid N+1 roundtrips as group size grows.
  const blocked = await pool.query(
    `
    SELECT 1
    FROM echo_group_dm_members gm
    INNER JOIN echo_user_blocks b
      ON (
        (b.blocker_id = $2 AND b.blocked_id = gm.user_id)
        OR
        (b.blocker_id = gm.user_id AND b.blocked_id = $2)
      )
    WHERE gm.channel_id = $1
      AND gm.user_id <> $2
    LIMIT 1
    `,
    [channelId, userId],
  );
  return blocked.rows.length === 0;
}

async function ensureEchoDmCategoryId(pool: pg.Pool): Promise<string> {
  const cat = await pool.query(
    `SELECT id FROM echo_categories WHERE server_id = $1 ORDER BY position ASC LIMIT 1`,
    [ECHO_DM_REALM_SERVER_ID],
  );
  if (cat.rows[0]) return String(cat.rows[0].id);
  const categoryId = nextEchoSnowflakeId();
  await pool.query(
    `INSERT INTO echo_categories (id, server_id, name, position) VALUES ($1, $2, 'DMs', 0)`,
    [categoryId, ECHO_DM_REALM_SERVER_ID],
  );
  return categoryId;
}

export async function ensureEchoDmRealm(
  pool: pg.Pool,
  actorUserId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO echo_servers (id, name, icon_url, owner_id) VALUES ($1, $2, '', $3) ON CONFLICT (id) DO NOTHING`,
    [ECHO_DM_REALM_SERVER_ID, 'Direct messages', actorUserId],
  );
}

export async function listEchoDmThreadsForUser(
  pool: pg.Pool,
  userId: string,
): Promise<EchoDmThreadRow[]> {
  return queryEchoDmThreadsForUser(pool, userId);
}

export async function userHasEchoDirectDmAccess(
  pool: pg.Pool,
  channelId: string,
  userId: string,
): Promise<boolean> {
  const peerId = await getEchoDmPeerUserId(pool, channelId, userId);
  if (!peerId) return false;
  if (peerId === userId) return true;
  if (await isEchoPairBlocked(pool, userId, peerId)) return false;
  if (await echoPairMayParticipateInDm(pool, userId, peerId)) return true;
  const req = await getEchoDmMessageRequestByChannelId(pool, channelId);
  if (!req) return false;
  if (req.status !== 'pending' && req.status !== 'accepted') return false;
  return req.requesterUserId === userId || req.recipientUserId === userId;
}

export async function listEchoDmMessageRequestsForUser(
  pool: pg.Pool,
  userId: string,
): Promise<EchoDmMessageRequestListRow[]> {
  const rows = await selectEchoDmMessageRequestsPendingPreviewRows(
    pool,
    userId,
  );
  return rows.map((row) => ({
    id: String(row.channel_id),
    channelId: String(row.channel_id),
    fromUserId: String(row.requester_user_id),
    preview: String(row.preview ?? 'New message request'),
  }));
}

export async function acceptEchoDmMessageRequest(
  pool: pg.Pool,
  channelId: string,
  userId: string,
): Promise<
  | { ok: true; channelId: string; peerUserId: string }
  | { ok: false; reason: 'not_found' | 'forbidden' }
> {
  const req = await getEchoDmMessageRequestByChannelId(pool, channelId);
  if (!req || req.status === 'ignored')
    return { ok: false, reason: 'not_found' };
  if (req.recipientUserId !== userId) return { ok: false, reason: 'forbidden' };
  if (req.status !== 'accepted') {
    await markEchoDmMessageRequestAcceptedIfPresent(pool, channelId);
  }
  return {
    ok: true,
    channelId,
    peerUserId: req.requesterUserId,
  };
}

export async function ignoreEchoDmMessageRequest(
  pool: pg.Pool,
  channelId: string,
  userId: string,
): Promise<'ok' | 'not_found' | 'forbidden'> {
  const req = await getEchoDmMessageRequestByChannelId(pool, channelId);
  if (!req || req.status === 'ignored') return 'not_found';
  if (req.recipientUserId !== userId) return 'forbidden';
  await upsertEchoDmMessageRequest(
    pool,
    channelId,
    req.requesterUserId,
    req.recipientUserId,
    'ignored',
  );
  return 'ok';
}

export async function getOrCreateEchoDmThread(
  pool: pg.Pool,
  userId: string,
  peerId: string,
): Promise<
  | { ok: true; channelId: string }
  | { ok: false; reason: 'not_friend' | 'unknown_peer' | 'blocked' }
> {
  if (userId.trim() === peerId.trim()) {
    const self = userId.trim();
    if (!self) return { ok: false, reason: 'unknown_peer' };
    const exists = await pool.query<{ channel_id: string }>(
      `
      SELECT channel_id
      FROM echo_dm_threads
      WHERE user_low = $1 AND user_high = $1
      LIMIT 1
      `,
      [self],
    );
    if (exists.rows[0]) {
      return { ok: true, channelId: String(exists.rows[0].channel_id) };
    }
    const peerRow = await pool.query(`SELECT 1 FROM auth_users WHERE id = $1`, [
      self,
    ]);
    if (peerRow.rows.length === 0) return { ok: false, reason: 'unknown_peer' };
    await ensureEchoDmRealm(pool, self);
    const categoryId = await ensureEchoDmCategoryId(pool);
    const channelId = nextEchoSnowflakeId();
    const maxPos = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM echo_channels WHERE server_id = $1 AND category_id = $2`,
      [ECHO_DM_REALM_SERVER_ID, categoryId],
    );
    const position = Number(maxPos.rows[0]?.p ?? 0);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO echo_channels (id, server_id, name, type, category_id, position, icon_key) VALUES ($1, $2, $3, 'text', $4, $5, '')`,
        [channelId, ECHO_DM_REALM_SERVER_ID, 'direct', categoryId, position],
      );
      await client.query(
        `INSERT INTO echo_dm_threads (channel_id, user_low, user_high) VALUES ($1, $2, $3)`,
        [channelId, self, self],
      );
      await bumpEchoDmThreadActivity(client, channelId, new Date(), 'open');
      await client.query('COMMIT');
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      const again = await pool.query<{ channel_id: string }>(
        `
        SELECT channel_id
        FROM echo_dm_threads
        WHERE user_low = $1 AND user_high = $1
        LIMIT 1
        `,
        [self],
      );
      if (again.rows[0]) {
        return { ok: true, channelId: String(again.rows[0].channel_id) };
      }
      throw e;
    } finally {
      client.release();
    }
    return { ok: true, channelId };
  }
  const peerRow = await pool.query(`SELECT 1 FROM auth_users WHERE id = $1`, [
    peerId,
  ]);
  if (peerRow.rows.length === 0) return { ok: false, reason: 'unknown_peer' };
  if (await isEchoPairBlocked(pool, userId, peerId))
    return { ok: false, reason: 'blocked' };
  const eligible = await echoPairMayParticipateInDm(pool, userId, peerId);
  const existing = await getEchoDmThreadAccessStateByPair(pool, userId, peerId);
  // Strangers (no friendship, no shared server, no existing thread) cannot open a fresh
  // DM via `/dm/open` — they must go through a separate request flow. Existing threads
  // (incl. pending message requests) still resolve so accepted/ignored states behave as below.
  if (!existing && !eligible) {
    return { ok: false, reason: 'not_friend' };
  }
  if (existing) {
    if (eligible) {
      await markEchoDmMessageRequestAcceptedIfPresent(pool, existing.channelId);
      return { ok: true, channelId: existing.channelId };
    }
    if (existing.status === 'pending' || existing.status === 'accepted') {
      return { ok: true, channelId: existing.channelId };
    }
    if (existing.status === 'ignored') {
      if (existing.requesterUserId === userId) {
        // They ignored me. Don't auto-reset to pending; just return not_friend.
        return { ok: false, reason: 'not_friend' };
      }
      // I am the recipient and I ignored them. Re-opening un-ignores.
      await markEchoDmMessageRequestAcceptedIfPresent(pool, existing.channelId);
      return { ok: true, channelId: existing.channelId };
    }
    // Fallback for any other state: reset to pending only if not currently ignored
    await upsertEchoDmMessageRequest(
      pool,
      existing.channelId,
      userId,
      peerId,
      'pending',
    );
    return { ok: true, channelId: existing.channelId };
  }

  await ensureEchoDmRealm(pool, userId);
  const categoryId = await ensureEchoDmCategoryId(pool);
  const channelId = nextEchoSnowflakeId();
  const maxPos = await pool.query(
    `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM echo_channels WHERE server_id = $1 AND category_id = $2`,
    [ECHO_DM_REALM_SERVER_ID, categoryId],
  );
  const position = Number(maxPos.rows[0]?.p ?? 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO echo_channels (id, server_id, name, type, category_id, position, icon_key) VALUES ($1, $2, $3, 'text', $4, $5, '')`,
      [channelId, ECHO_DM_REALM_SERVER_ID, 'direct', categoryId, position],
    );
    await client.query(
      `INSERT INTO echo_dm_threads (channel_id, user_low, user_high) VALUES ($1, $2, $3)`,
      [
        channelId,
        userId < peerId ? userId : peerId,
        userId < peerId ? peerId : userId,
      ],
    );
    await bumpEchoDmThreadActivity(client, channelId, new Date(), 'open');
    if (!eligible) {
      await upsertEchoDmMessageRequest(
        client,
        channelId,
        userId,
        peerId,
        'pending',
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    const again = await getEchoDmThreadAccessStateByPair(pool, userId, peerId);
    if (again) return { ok: true, channelId: again.channelId };
    throw e;
  } finally {
    client.release();
  }

  return { ok: true, channelId };
}

export async function createEchoGroupDmThread(
  pool: pg.Pool,
  initiatorUserId: string,
  memberUserIds: string[],
  displayName: string,
): Promise<
  | { ok: true; channelId: string }
  | {
      ok: false;
      reason:
        | 'bad_members'
        | 'not_eligible'
        | 'blocked'
        | 'too_few'
        | 'too_many'
        | 'unknown_peer';
    }
> {
  const unique = [
    ...new Set(memberUserIds.map((x) => String(x).trim()).filter(Boolean)),
  ];
  if (
    unique.length !== memberUserIds.length ||
    !unique.includes(initiatorUserId)
  ) {
    return { ok: false, reason: 'bad_members' };
  }
  const { groupDmMaxMembers } = await getEchoEntitlements(
    pool,
    initiatorUserId,
  );
  if (
    unique.length < ECHO_GROUP_DM_MIN_MEMBERS ||
    unique.length > groupDmMaxMembers
  ) {
    return {
      ok: false,
      reason:
        unique.length < ECHO_GROUP_DM_MIN_MEMBERS ? 'too_few' : 'too_many',
    };
  }
  const knownUsers = await pool.query<{ id: string }>(
    `SELECT id FROM auth_users WHERE id = ANY($1)`,
    [unique],
  );
  if (knownUsers.rows.length !== unique.length) {
    return { ok: false, reason: 'unknown_peer' };
  }
  const pairPolicy = await validateEchoGroupDmPairPolicy(pool, unique);
  if (pairPolicy !== 'ok') {
    return { ok: false, reason: pairPolicy };
  }

  await ensureEchoDmRealm(pool, initiatorUserId);
  const categoryId = await ensureEchoDmCategoryId(pool);
  const channelId = nextEchoSnowflakeId();
  const maxPos = await pool.query(
    `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM echo_channels WHERE server_id = $1 AND category_id = $2`,
    [ECHO_DM_REALM_SERVER_ID, categoryId],
  );
  const position = Number(maxPos.rows[0]?.p ?? 0);
  const name = clampEchoChannelName(displayName) || 'Group';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO echo_channels (id, server_id, name, type, category_id, position, icon_key, group_dm_owner_user_id) VALUES ($1, $2, $3, 'text', $4, $5, '', $6)`,
      [
        channelId,
        ECHO_DM_REALM_SERVER_ID,
        name,
        categoryId,
        position,
        initiatorUserId,
      ],
    );
    for (const uid of unique) {
      await client.query(
        `INSERT INTO echo_group_dm_members (channel_id, user_id) VALUES ($1, $2)`,
        [channelId, uid],
      );
    }
    await bumpEchoDmThreadActivity(
      client,
      channelId,
      new Date(),
      'group_event',
    );
    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }

  return { ok: true, channelId };
}

export async function addEchoGroupDmMembers(
  pool: pg.Pool,
  actorUserId: string,
  channelId: string,
  memberUserIds: string[],
): Promise<
  | { ok: true; addedMemberUserIds: string[] }
  | {
      ok: false;
      reason:
        | 'invalid_members'
        | 'forbidden'
        | 'not_found'
        | 'too_many'
        | 'blocked'
        | 'not_eligible';
    }
> {
  const actor = actorUserId.trim();
  const cid = channelId.trim();
  if (!actor || !cid) return { ok: false, reason: 'not_found' };
  const incoming = [
    ...new Set(memberUserIds.map((id) => String(id).trim()).filter(Boolean)),
  ].filter((id) => id !== actor);
  if (!incoming.length) return { ok: false, reason: 'invalid_members' };

  const ch = await pool.query(
    `SELECT 1 FROM echo_channels WHERE id = $1 AND server_id = $2 LIMIT 1`,
    [cid, ECHO_DM_REALM_SERVER_ID],
  );
  if (!ch.rows[0]) return { ok: false, reason: 'not_found' };

  const existing = await listEchoGroupDmMemberIds(pool, cid);
  if (!existing.length) return { ok: false, reason: 'not_found' };
  if (!existing.includes(actor)) return { ok: false, reason: 'forbidden' };

  const toAdd = incoming.filter((id) => !existing.includes(id));
  if (!toAdd.length) return { ok: true, addedMemberUserIds: [] };

  const knownToAdd = await pool.query<{ id: string }>(
    `SELECT id FROM auth_users WHERE id = ANY($1)`,
    [toAdd],
  );
  if (knownToAdd.rows.length !== toAdd.length) {
    return { ok: false, reason: 'invalid_members' };
  }

  const toAddSet = new Set(toAdd);
  const pairPolicy = await validateEchoGroupDmPairPolicy(
    pool,
    [...existing, ...toAdd],
    (a, b) => toAddSet.has(a) || toAddSet.has(b),
  );
  if (pairPolicy !== 'ok') {
    return { ok: false, reason: pairPolicy };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lockRows = await client.query<{ user_id: string }>(
      `SELECT user_id FROM echo_group_dm_members WHERE channel_id = $1 FOR UPDATE`,
      [cid],
    );
    const lockedExisting = lockRows.rows.map((row) => String(row.user_id));
    const toAddAfterLock = incoming.filter(
      (id) => !lockedExisting.includes(id),
    );
    const { groupDmMaxMembers } = await getEchoEntitlements(client, actor);
    if (lockedExisting.length + toAddAfterLock.length > groupDmMaxMembers) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'too_many' };
    }
    for (const uid of toAddAfterLock) {
      await client.query(
        `INSERT INTO echo_group_dm_members (channel_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (channel_id, user_id) DO NOTHING`,
        [cid, uid],
      );
    }
    if (toAddAfterLock.length > 0) {
      await bumpEchoDmThreadActivity(client, cid, new Date(), 'group_event');
    }
    await client.query('COMMIT');
    return { ok: true, addedMemberUserIds: toAddAfterLock };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

async function resolveEchoGroupDmOwnerId(
  pool: pg.Pool,
  channelId: string,
): Promise<string | null> {
  const r = await pool.query(
    `SELECT group_dm_owner_user_id FROM echo_channels WHERE id = $1 AND server_id = $2 LIMIT 1`,
    [channelId, ECHO_DM_REALM_SERVER_ID],
  );
  const stored = r.rows[0]?.group_dm_owner_user_id;
  if (stored != null && String(stored).trim()) return String(stored).trim();
  const legacy = await pool.query(
    `SELECT user_id FROM echo_group_dm_members WHERE channel_id = $1 ORDER BY user_id ASC LIMIT 1`,
    [channelId],
  );
  return legacy.rows[0] ? String(legacy.rows[0].user_id) : null;
}

/**
 * Remove another member from a group DM. Only the group owner may remove others.
 * Cannot remove yourself — use `leaveEchoGroupDm` instead.
 */
export async function removeEchoGroupDmMember(
  pool: pg.Pool,
  actorUserId: string,
  channelId: string,
  targetUserId: string,
): Promise<'ok' | 'forbidden' | 'not_found' | 'bad_target'> {
  const cid = channelId.trim();
  const actor = actorUserId.trim();
  const target = targetUserId.trim();
  if (!cid || !actor || !target) return 'not_found';
  if (actor === target) return 'bad_target';

  const ch = await pool.query(
    `SELECT 1 FROM echo_channels WHERE id = $1 AND server_id = $2 LIMIT 1`,
    [cid, ECHO_DM_REALM_SERVER_ID],
  );
  if (ch.rows.length === 0) return 'not_found';

  const actorMem = await pool.query(
    `SELECT 1 FROM echo_group_dm_members WHERE channel_id = $1 AND user_id = $2 LIMIT 1`,
    [cid, actor],
  );
  if (actorMem.rows.length === 0) return 'forbidden';

  const ownerId = await resolveEchoGroupDmOwnerId(pool, cid);
  if (!ownerId || ownerId !== actor) return 'forbidden';
  if (target === ownerId) return 'forbidden';

  const targetMem = await pool.query(
    `SELECT 1 FROM echo_group_dm_members WHERE channel_id = $1 AND user_id = $2 LIMIT 1`,
    [cid, target],
  );
  if (targetMem.rows.length === 0) return 'not_found';

  const del = await pool.query(
    `DELETE FROM echo_group_dm_members WHERE channel_id = $1 AND user_id = $2`,
    [cid, target],
  );
  return del.rowCount ? 'ok' : 'not_found';
}

/** Remove the current user from a group DM (cannot be done via `removeEchoGroupDmMember`). */
export async function leaveEchoGroupDm(
  pool: pg.Pool,
  userId: string,
  channelId: string,
): Promise<'ok' | 'forbidden' | 'not_found'> {
  const cid = channelId.trim();
  const uid = userId.trim();
  if (!cid || !uid) return 'not_found';

  const ch = await pool.query(
    `SELECT 1 FROM echo_channels WHERE id = $1 AND server_id = $2 LIMIT 1`,
    [cid, ECHO_DM_REALM_SERVER_ID],
  );
  if (ch.rows.length === 0) return 'not_found';

  const mem = await pool.query(
    `SELECT 1 FROM echo_group_dm_members WHERE channel_id = $1 AND user_id = $2 LIMIT 1`,
    [cid, uid],
  );
  if (mem.rows.length === 0) return 'forbidden';

  const ownerId = await resolveEchoGroupDmOwnerId(pool, cid);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query(
      `DELETE FROM echo_group_dm_members WHERE channel_id = $1 AND user_id = $2`,
      [cid, uid],
    );
    if (!del.rowCount) {
      await client.query('ROLLBACK');
      return 'not_found';
    }
    if (ownerId === uid) {
      const nextOwner = await client.query(
        `SELECT user_id FROM echo_group_dm_members WHERE channel_id = $1 ORDER BY user_id ASC LIMIT 1`,
        [cid],
      );
      const nextId = nextOwner.rows[0]
        ? String(nextOwner.rows[0].user_id)
        : null;
      await client.query(
        `UPDATE echo_channels SET group_dm_owner_user_id = $2 WHERE id = $1`,
        [cid, nextId],
      );
    }
    await client.query('COMMIT');
    return 'ok';
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function updateEchoGroupDm(
  pool: pg.Pool,
  userId: string,
  channelId: string,
  patch: { name?: string; pfp?: string },
): Promise<
  'ok' | 'forbidden' | 'not_found' | 'invalid_name' | 'invalid_pfp' | 'noop'
> {
  const cid = channelId.trim();
  const uid = userId.trim();
  const mem = await pool.query(
    `SELECT 1 FROM echo_group_dm_members WHERE channel_id = $1 AND user_id = $2 LIMIT 1`,
    [cid, uid],
  );
  if (mem.rows.length === 0) return 'forbidden';

  const ownerId = await resolveEchoGroupDmOwnerId(pool, cid);
  if (!ownerId || ownerId !== uid) return 'forbidden';

  const hasName = patch.name !== undefined;
  const hasPfp = patch.pfp !== undefined;
  if (!hasName && !hasPfp) return 'noop';

  const vals: unknown[] = [];
  const setParts: string[] = [];
  let p = 1;

  if (hasName) {
    const cleanName = clampEchoChannelName(patch.name ?? '');
    if (!cleanName.trim()) return 'invalid_name';
    setParts.push(`name = $${p++}`);
    vals.push(cleanName);
  }

  if (hasPfp) {
    const t = (patch.pfp ?? '').trim();
    let iconVal = '';
    if (t) {
      const v = validateEchoStoredBrandingUrl(t);
      if (!v.ok) return 'invalid_pfp';
      iconVal = v.value;
    }
    setParts.push(`icon_key = $${p++}`);
    vals.push(iconVal);
  }

  vals.push(cid, ECHO_DM_REALM_SERVER_ID);
  const res = await pool.query(
    `UPDATE echo_channels SET ${setParts.join(', ')} WHERE id = $${p} AND server_id = $${
      p + 1
    }`,
    vals,
  );

  return res.rowCount ? 'ok' : 'not_found';
}

/**
 * True when the viewer may resolve the peer's public profile (display name, avatar) for DM UI.
 * Covers mutual visibility (friends / shared servers), an existing 1:1 DM thread, or a pending /
 * accepted message request — including cases where the peer is absent from workspace snapshots.
 */
export async function echoPeerProfileVisibleToViewer(
  pool: pg.Pool,
  viewerUserId: string,
  peerUserId: string,
): Promise<boolean> {
  const viewer = viewerUserId.trim();
  const peer = peerUserId.trim();
  if (!viewer || !peer) return false;
  if (viewer === peer) return true;
  const visible = await filterVisibleEchoUserIds(pool, viewer, [peer]);
  if (visible.includes(peer)) return true;
  if (await echoUsersShareDirectDm(pool, viewer, peer)) return true;
  const r = await pool.query(
    `
    SELECT 1
      FROM echo_dm_message_requests mr
     WHERE mr.status IN ('pending', 'accepted')
       AND (
         (mr.requester_user_id = $1 AND mr.recipient_user_id = $2)
         OR (mr.requester_user_id = $2 AND mr.recipient_user_id = $1)
       )
     LIMIT 1
    `,
    [viewer, peer],
  );
  return r.rows.length > 0;
}
