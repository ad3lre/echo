import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type pg from 'pg';
import { config } from '../config';
import { insertEchoAudit } from '../domain/echoStore';
import {
  publishEchoWorkspaceEvent,
  publishVoiceRosterDelta,
} from '../platform/echoPlatformEvents';
import {
  liveKitRoomName,
  listLiveKitParticipants,
  listLiveKitRooms,
} from './livekit/livekitAdapter';
import { vcTrace } from '../observability/voiceTraceLog';

/**
 * Reconcile `echo_voice_participants` against LiveKit reality so stale rows
 * (server restart, missed webhook, crashed client) cannot persist.
 *
 * - `boot`: run once at startup; with LiveKit disabled this wipes all rows
 *   (nothing can be live across a cold server boot).
 * - `periodic`: background job; no-op when LiveKit is disabled (we only wipe
 *   at boot to avoid fighting deliberate LiveKit-less deployments at runtime).
 * - `manual`: same as `periodic` — safe to trigger from ops endpoints/tests.
 */
export type EchoVoiceReconcileReason =
  | 'boot'
  | 'periodic'
  | 'manual'
  /** After any Echo socket disconnect; clears DB rows when LiveKit has no matching participant. */
  | 'socket_follow_up';

export type EchoVoiceReconcileSkip =
  | 'livekit_disabled_non_boot'
  | 'livekit_unreachable';

export type EchoVoiceReconcileResult = {
  deletedRows: number;
  affectedServers: number;
  checkedGroups: number;
  liveKitChecked: boolean;
  liveKitReachable: boolean;
  skipped?: EchoVoiceReconcileSkip;
};

type VoiceGroupRow = {
  serverId: string;
  channelId: string;
  userIds: string[];
};

type DeletedRow = {
  serverId: string;
  channelId: string;
  userId: string;
};

async function loadVoiceParticipantGroups(
  pool: pg.Pool,
): Promise<VoiceGroupRow[]> {
  const r = await pool.query(
    `SELECT server_id, channel_id, ARRAY_AGG(user_id ORDER BY joined_at ASC) AS user_ids
     FROM echo_voice_participants
     GROUP BY server_id, channel_id`,
  );
  return (
    r.rows as { server_id: unknown; channel_id: unknown; user_ids: unknown }[]
  ).map((row) => ({
    serverId: String(row.server_id),
    channelId: String(row.channel_id),
    userIds: Array.isArray(row.user_ids)
      ? row.user_ids.map((x) => String(x))
      : [],
  }));
}

async function wipeAllEchoVoiceParticipants(
  pool: pg.Pool,
): Promise<DeletedRow[]> {
  const r = await pool.query(
    `DELETE FROM echo_voice_participants
     RETURNING server_id, channel_id, user_id`,
  );
  return (
    r.rows as { server_id: unknown; channel_id: unknown; user_id: unknown }[]
  ).map((row) => ({
    serverId: String(row.server_id),
    channelId: String(row.channel_id),
    userId: String(row.user_id),
  }));
}

async function deleteStaleEchoVoiceParticipantsForChannel(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
  userIds: string[],
): Promise<DeletedRow[]> {
  if (userIds.length === 0) return [];
  const r = await pool.query(
    `DELETE FROM echo_voice_participants
     WHERE server_id = $1 AND channel_id = $2 AND user_id = ANY($3::text[])
     RETURNING server_id, channel_id, user_id`,
    [serverId, channelId, userIds],
  );
  return (
    r.rows as { server_id: unknown; channel_id: unknown; user_id: unknown }[]
  ).map((row) => ({
    serverId: String(row.server_id),
    channelId: String(row.channel_id),
    userId: String(row.user_id),
  }));
}

/** Best-effort audit; a single bad row (e.g. deleted user) must not abort reconcile. */
async function safeInsertAudit(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  channelId: string,
  reason: EchoVoiceReconcileReason,
  occurredAtMs: number,
  log: FastifyBaseLogger,
): Promise<string | null> {
  try {
    return await insertEchoAudit(
      pool,
      serverId,
      userId,
      'voice.leave_reconcile_livekit',
      'channel',
      channelId,
      { reason, occurredAtMs },
    );
  } catch (e) {
    vcTrace(log, 'voice.reconcile:audit_insert_failed', {
      serverId,
      userId,
      channelId,
      reason,
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

async function emitReconcileEvents(
  fastify: FastifyInstance,
  pool: pg.Pool,
  deleted: DeletedRow[],
  reason: EchoVoiceReconcileReason,
  occurredAtMs: number,
  log: FastifyBaseLogger,
): Promise<void> {
  if (deleted.length === 0) return;
  const byServer = new Map<string, DeletedRow[]>();
  for (const row of deleted) {
    if (!byServer.has(row.serverId)) byServer.set(row.serverId, []);
    byServer.get(row.serverId)!.push(row);
  }
  for (const [serverId, rows] of byServer) {
    let latestAuditId: string | null = null;
    for (const row of rows) {
      const id = await safeInsertAudit(
        pool,
        serverId,
        row.userId,
        row.channelId,
        reason,
        occurredAtMs,
        log,
      );
      if (id) latestAuditId = id;
      // Per-user delta so sidebars update immediately (tier-1 fast path).
      publishVoiceRosterDelta(
        fastify,
        serverId,
        { channelId: row.channelId, userId: row.userId, action: 'leave' },
        id ?? `reconcile-${occurredAtMs}`,
      );
    }
    publishEchoWorkspaceEvent(
      fastify,
      {
        kind: 'workspace_invalidated',
        version: latestAuditId ?? `reconcile-${occurredAtMs}`,
        serverId,
      },
      { serverId },
    );
  }
}

export async function reconcileEchoVoiceParticipantsAgainstLiveKit(opts: {
  fastify: FastifyInstance;
  pool: pg.Pool;
  reason: EchoVoiceReconcileReason;
  log?: FastifyBaseLogger;
}): Promise<EchoVoiceReconcileResult> {
  const { fastify, pool, reason } = opts;
  const log = opts.log ?? fastify.log;
  const occurredAtMs = Date.now();

  vcTrace(log, 'voice.reconcile:start', { reason });

  const groups = await loadVoiceParticipantGroups(pool);
  if (groups.length === 0) {
    vcTrace(log, 'voice.reconcile:no_rows', { reason });
    return {
      deletedRows: 0,
      affectedServers: 0,
      checkedGroups: 0,
      liveKitChecked: false,
      liveKitReachable: false,
    };
  }

  if (!config.liveKitEnabled) {
    if (reason !== 'boot') {
      vcTrace(log, 'voice.reconcile:skip_livekit_disabled', {
        reason,
        groupCount: groups.length,
      });
      return {
        deletedRows: 0,
        affectedServers: 0,
        checkedGroups: groups.length,
        liveKitChecked: false,
        liveKitReachable: false,
        skipped: 'livekit_disabled_non_boot',
      };
    }
    // Boot with LiveKit disabled: no real-time voice is possible, every row is stale by definition.
    const deleted = await wipeAllEchoVoiceParticipants(pool);
    await emitReconcileEvents(
      fastify,
      pool,
      deleted,
      reason,
      occurredAtMs,
      log,
    );
    vcTrace(log, 'voice.reconcile:boot_wipe_livekit_disabled', {
      deletedRows: deleted.length,
      affectedServers: new Set(deleted.map((d) => d.serverId)).size,
    });
    return {
      deletedRows: deleted.length,
      affectedServers: new Set(deleted.map((d) => d.serverId)).size,
      checkedGroups: groups.length,
      liveKitChecked: false,
      liveKitReachable: false,
    };
  }

  let activeRoomNames: Set<string>;
  try {
    const rooms = await listLiveKitRooms();
    activeRoomNames = new Set(rooms.map((r) => r.name));
  } catch (e) {
    vcTrace(log, 'voice.reconcile:listRooms_failed', {
      reason,
      err: e instanceof Error ? e.message : String(e),
    });
    return {
      deletedRows: 0,
      affectedServers: 0,
      checkedGroups: groups.length,
      liveKitChecked: true,
      liveKitReachable: false,
      skipped: 'livekit_unreachable',
    };
  }

  const deleted: DeletedRow[] = [];

  for (const group of groups) {
    const roomName = liveKitRoomName(group.serverId, group.channelId);
    if (!activeRoomNames.has(roomName)) {
      // Whole room is gone → every DB row for this channel is stale.
      const wiped = await deleteStaleEchoVoiceParticipantsForChannel(
        pool,
        group.serverId,
        group.channelId,
        group.userIds,
      );
      deleted.push(...wiped);
      continue;
    }
    let liveIdentities: Set<string>;
    try {
      const participants = await listLiveKitParticipants(roomName);
      liveIdentities = new Set(participants.map((p) => p.identity));
    } catch (e) {
      vcTrace(log, 'voice.reconcile:listParticipants_failed', {
        roomName,
        reason,
        err: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    const stale = group.userIds.filter((uid) => !liveIdentities.has(uid));
    if (stale.length === 0) continue;
    const wiped = await deleteStaleEchoVoiceParticipantsForChannel(
      pool,
      group.serverId,
      group.channelId,
      stale,
    );
    deleted.push(...wiped);
  }

  await emitReconcileEvents(fastify, pool, deleted, reason, occurredAtMs, log);

  const affectedServers = new Set(deleted.map((d) => d.serverId)).size;
  vcTrace(log, 'voice.reconcile:done', {
    reason,
    deletedRows: deleted.length,
    affectedServers,
    checkedGroups: groups.length,
  });

  return {
    deletedRows: deleted.length,
    affectedServers,
    checkedGroups: groups.length,
    liveKitChecked: true,
    liveKitReachable: true,
  };
}

/**
 * Like {@link reconcileEchoVoiceParticipantsAgainstLiveKit} but only for rows
 * belonging to `userId`. Used after socket disconnect so a crashed VC client is
 * not stuck in `echo_voice_participants` until the next periodic job when
 * another tab kept the user "online" or a `participant_left` webhook was missed.
 */
export async function reconcileEchoVoiceParticipantsForUserAgainstLiveKit(opts: {
  fastify: FastifyInstance;
  pool: pg.Pool;
  userId: string;
  reason: EchoVoiceReconcileReason;
  log?: FastifyBaseLogger;
}): Promise<EchoVoiceReconcileResult> {
  const { fastify, pool, userId, reason } = opts;
  const log = opts.log ?? fastify.log;
  const occurredAtMs = Date.now();
  const uid = userId.trim();
  if (!uid) {
    return {
      deletedRows: 0,
      affectedServers: 0,
      checkedGroups: 0,
      liveKitChecked: false,
      liveKitReachable: false,
    };
  }

  vcTrace(log, 'voice.reconcile_user:start', { reason, userId: uid });

  if (!config.liveKitEnabled) {
    vcTrace(log, 'voice.reconcile_user:skip_livekit_disabled', { reason });
    return {
      deletedRows: 0,
      affectedServers: 0,
      checkedGroups: 0,
      liveKitChecked: false,
      liveKitReachable: false,
    };
  }

  const rows = await pool.query(
    `SELECT server_id, channel_id FROM echo_voice_participants WHERE user_id = $1`,
    [uid],
  );
  const pairs = (
    rows.rows as { server_id: unknown; channel_id: unknown }[]
  ).map((r) => ({
    serverId: String(r.server_id),
    channelId: String(r.channel_id),
  }));
  if (pairs.length === 0) {
    vcTrace(log, 'voice.reconcile_user:no_rows', { reason, userId: uid });
    return {
      deletedRows: 0,
      affectedServers: 0,
      checkedGroups: 0,
      liveKitChecked: false,
      liveKitReachable: false,
    };
  }

  let activeRoomNames: Set<string>;
  try {
    const rooms = await listLiveKitRooms();
    activeRoomNames = new Set(rooms.map((r) => r.name));
  } catch (e) {
    vcTrace(log, 'voice.reconcile_user:listRooms_failed', {
      reason,
      err: e instanceof Error ? e.message : String(e),
    });
    return {
      deletedRows: 0,
      affectedServers: 0,
      checkedGroups: pairs.length,
      liveKitChecked: true,
      liveKitReachable: false,
      skipped: 'livekit_unreachable',
    };
  }

  const deleted: DeletedRow[] = [];

  for (const { serverId, channelId } of pairs) {
    const roomName = liveKitRoomName(serverId, channelId);
    if (!activeRoomNames.has(roomName)) {
      const wiped = await deleteStaleEchoVoiceParticipantsForChannel(
        pool,
        serverId,
        channelId,
        [uid],
      );
      deleted.push(...wiped);
      continue;
    }
    let liveIdentities: Set<string>;
    try {
      const participants = await listLiveKitParticipants(roomName);
      liveIdentities = new Set(participants.map((p) => p.identity));
    } catch (e) {
      vcTrace(log, 'voice.reconcile_user:listParticipants_failed', {
        roomName,
        reason,
        err: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    if (liveIdentities.has(uid)) continue;
    const wiped = await deleteStaleEchoVoiceParticipantsForChannel(
      pool,
      serverId,
      channelId,
      [uid],
    );
    deleted.push(...wiped);
  }

  await emitReconcileEvents(fastify, pool, deleted, reason, occurredAtMs, log);

  const affectedServers = new Set(deleted.map((d) => d.serverId)).size;
  vcTrace(log, 'voice.reconcile_user:done', {
    reason,
    userId: uid,
    deletedRows: deleted.length,
    affectedServers,
    checkedGroups: pairs.length,
  });

  return {
    deletedRows: deleted.length,
    affectedServers,
    checkedGroups: pairs.length,
    liveKitChecked: true,
    liveKitReachable: true,
  };
}
