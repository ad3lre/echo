import type pg from 'pg';
import { canActorModerateTargetMember, removeEchoServerMember } from './access';
import { invalidateEchoPermissionCacheForServer } from '../echoPermissionCache';
import { type EchoPermission } from '../echoPermissionPrimitives';
import {
  deleteEchoServerIpBansForBannedUser,
  upsertEchoServerIpBanAfterUserBan,
} from './serverIpBans';

/** Matches `MAX_ECHO_TIMEOUT_MINUTES` in frontend `constants/echoModerationLimits.ts`. */
const MAX_TIMEOUT_MINUTES = 40320;
/** Temporary bans only; permanent bans omit duration. */
const MAX_BAN_DURATION_MINUTES = 365 * 24 * 60;

export async function applyEchoModerationAction(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  action: string,
  targetUserId: string,
  meta: Record<string, unknown>,
): Promise<void> {
  if (targetUserId === actorId) {
    throw new Error('INVALID_TARGET');
  }
  const owner = await pool.query(
    `SELECT owner_id FROM echo_servers WHERE id = $1`,
    [serverId],
  );
  const ownerId = owner.rows[0] ? String(owner.rows[0].owner_id) : '';
  if (targetUserId === ownerId) {
    throw new Error('CANNOT_MODERATE_OWNER');
  }

  const requiredPerm: EchoPermission =
    action === 'ban' || action === 'unban'
      ? 'BAN_MEMBERS'
      : action === 'kick'
        ? 'KICK_MEMBERS'
        : 'MODERATE_MEMBERS';

  if (
    !(await canActorModerateTargetMember(
      pool,
      serverId,
      actorId,
      targetUserId,
      requiredPerm,
    ))
  ) {
    throw new Error('CANNOT_MODERATE_PEER');
  }

  switch (action) {
    case 'ban': {
      const rawReason = meta.reason;
      const reasonStr =
        typeof rawReason === 'string' ? rawReason.trim().slice(0, 500) : '';
      const rawDur = meta.banDurationMinutes;
      const minutes =
        typeof rawDur === 'number' && Number.isFinite(rawDur) && rawDur > 0
          ? Math.min(MAX_BAN_DURATION_MINUTES, Math.floor(rawDur))
          : null;
      await pool.query(
        `
        INSERT INTO echo_server_bans (server_id, user_id, expires_at, reason, banned_by, created_at)
        VALUES (
          $1, $2,
          CASE WHEN $3::int IS NULL THEN NULL ELSE NOW() + ($3::int * interval '1 minute') END,
          NULLIF($4::text, ''),
          $5,
          NOW()
        )
        ON CONFLICT (server_id, user_id) DO UPDATE SET
          expires_at = EXCLUDED.expires_at,
          reason = EXCLUDED.reason,
          banned_by = EXCLUDED.banned_by,
          created_at = NOW()
        `,
        [serverId, targetUserId, minutes, reasonStr || null, actorId],
      );
      await upsertEchoServerIpBanAfterUserBan(pool, {
        serverId,
        targetUserId,
        actorId,
        minutes,
        reasonStr: reasonStr || null,
      });
      await removeEchoServerMember(pool, serverId, targetUserId);
      invalidateEchoPermissionCacheForServer(serverId);
      break;
    }
    case 'kick': {
      await removeEchoServerMember(pool, serverId, targetUserId);
      invalidateEchoPermissionCacheForServer(serverId);
      break;
    }
    case 'timeout': {
      const rawMin = meta.timeoutMinutes;
      const minutes =
        typeof rawMin === 'number' && Number.isFinite(rawMin) && rawMin > 0
          ? Math.min(MAX_TIMEOUT_MINUTES, Math.floor(rawMin))
          : 60;
      await pool.query(
        `
        INSERT INTO echo_server_member_timeouts (server_id, user_id, timeout_until, updated_at)
        VALUES ($1, $2, NOW() + ($3::int * interval '1 minute'), NOW())
        ON CONFLICT (server_id, user_id) DO UPDATE SET timeout_until = NOW() + ($3::int * interval '1 minute'), updated_at = NOW()
        `,
        [serverId, targetUserId, minutes],
      );
      invalidateEchoPermissionCacheForServer(serverId);
      break;
    }
    case 'untimeout': {
      await pool.query(
        `DELETE FROM echo_server_member_timeouts WHERE server_id = $1 AND user_id = $2`,
        [serverId, targetUserId],
      );
      invalidateEchoPermissionCacheForServer(serverId);
      break;
    }
    case 'unban': {
      await deleteEchoServerIpBansForBannedUser(pool, serverId, targetUserId);
      await pool.query(
        `DELETE FROM echo_server_bans WHERE server_id = $1 AND user_id = $2`,
        [serverId, targetUserId],
      );
      invalidateEchoPermissionCacheForServer(serverId);
      break;
    }
    case 'warn': {
      break;
    }
    default:
      throw new Error('UNKNOWN_ACTION');
  }
}
