import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import {
  applyEchoModerationAction,
  insertEchoAudit,
} from '../domain/echoStore';
import { publishEchoWorkspaceEvent } from '../platform/echoPlatformEvents';
import { evictUserFromEchoServerRealtimeScopes } from '../platform/echoRealtimeMembership';
import { config } from '../config';
import {
  liveKitRoomName,
  removeLiveKitParticipant,
} from './livekit/livekitAdapter';
import { purgeEchoAuthorRecentMessagesInServerAndBroadcast } from './echoMessageEditDeleteOps';

/** Whitelist for `meta.deleteRecentMessagesHours` on ban (compact windows). */
const DELETE_RECENT_MESSAGES_HOURS_ALLOWED = new Set([0, 1, 24, 72, 168]);

export function parseDeleteRecentMessagesHours(
  meta: Record<string, unknown>,
): number {
  const raw = meta.deleteRecentMessagesHours;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  const n = Math.floor(raw);
  return DELETE_RECENT_MESSAGES_HOURS_ALLOWED.has(n) ? n : 0;
}

export type EchoModerationResult =
  | { ok: true; auditId: string }
  | {
      ok: false;
      code:
        | 'INVALID_TARGET'
        | 'CANNOT_MODERATE_OWNER'
        | 'CANNOT_MODERATE_PEER'
        | 'UNKNOWN_ACTION';
      detail?: string;
    };

export async function runEchoModerationActionAndBroadcast(
  fastify: FastifyInstance,
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  action: string,
  targetUserId: string,
  meta: Record<string, unknown>,
): Promise<EchoModerationResult> {
  let liveKitVoiceChannelId: string | null = null;
  if (
    config.liveKitEnabled &&
    (action === 'ban' || action === 'kick' || action === 'timeout')
  ) {
    const vp = await pool.query(
      `SELECT channel_id FROM echo_voice_participants WHERE server_id = $1 AND user_id = $2`,
      [serverId, targetUserId],
    );
    const channelId = vp.rows[0]?.channel_id;
    if (channelId != null) {
      liveKitVoiceChannelId = String(channelId);
    }
  }

  try {
    await applyEchoModerationAction(
      pool,
      serverId,
      actorId,
      action,
      targetUserId,
      meta,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'CANNOT_MODERATE_OWNER')
      return { ok: false, code: 'CANNOT_MODERATE_OWNER' };
    if (msg === 'INVALID_TARGET') return { ok: false, code: 'INVALID_TARGET' };
    if (msg === 'CANNOT_MODERATE_PEER')
      return { ok: false, code: 'CANNOT_MODERATE_PEER' };
    if (msg === 'UNKNOWN_ACTION') return { ok: false, code: 'UNKNOWN_ACTION' };
    throw e;
  }

  if (action === 'ban' || action === 'kick' || action === 'timeout') {
    await evictUserFromEchoServerRealtimeScopes(fastify, pool, {
      serverId,
      userId: targetUserId,
    });
    if (config.liveKitEnabled && liveKitVoiceChannelId) {
      try {
        await removeLiveKitParticipant(
          liveKitRoomName(serverId, liveKitVoiceChannelId),
          targetUserId,
        );
      } catch (e) {
        fastify.log.warn(
          { err: e, serverId, targetUserId, liveKitVoiceChannelId },
          'Failed to remove Echo member from LiveKit after moderation',
        );
      }
    }
  }

  if (action === 'ban') {
    const purgeHours = parseDeleteRecentMessagesHours(meta);
    meta.deleteRecentMessagesHours = purgeHours;
    let purged = 0;
    if (purgeHours > 0 && fastify.io) {
      purged = await purgeEchoAuthorRecentMessagesInServerAndBroadcast(
        pool,
        fastify.io,
        serverId,
        targetUserId,
        purgeHours,
      );
    }
    meta.purgedMessageCount = purged;
  } else {
    delete meta.deleteRecentMessagesHours;
    delete meta.purgedMessageCount;
  }

  const auditId = await insertEchoAudit(
    pool,
    serverId,
    actorId,
    `moderation.${action}`,
    'user',
    targetUserId,
    meta,
  );

  const kind =
    action === 'kick' || action === 'ban' || action === 'unban'
      ? 'membership_changed'
      : action === 'timeout' || action === 'untimeout'
        ? 'permission_invalidated'
        : 'server_updated';

  publishEchoWorkspaceEvent(
    fastify,
    { kind, version: auditId, serverId, userId: targetUserId },
    { serverId, userId: targetUserId },
  );

  return { ok: true, auditId };
}
