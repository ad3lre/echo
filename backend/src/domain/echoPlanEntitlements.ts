import type pg from 'pg';
import {
  ECHO_FREE_PHONE_VERIFIED_UPLOAD_CAP_BYTES,
  ECHO_PLAN_FEATURE_FLAGS,
  ECHO_PLAN_GROUP_DM_MAX_MEMBERS,
  ECHO_PLAN_IMAGE_SEARCHES_PER_DAY,
  ECHO_PLAN_MAX_JOINED_SERVERS,
  ECHO_PLAN_THEME_TIER,
  ECHO_PLAN_UPLOAD_CAP_BYTES,
  ECHO_WATCH_TOGETHER_MAX_SESSION_BYTES,
  ECHO_WATCH_TOGETHER_MAX_VIDEO_BYTES,
  normalizeEchoPlanId,
  type EchoPlanId,
  type EchoPlanLimitsPublic,
} from '../../../shared/echoPlanLimits';
import { isPostgresUndefinedColumnError } from '../db/pgErrors';
import { readUserImageSearchUsage } from '../services/serperUserSearchQuota';

/** Must stay aligned with `ECHO_DM_REALM_SERVER_ID` in `echoStore/dmThreads`. */
const ECHO_DM_REALM_SERVER_ID = 'echo_dm_realm';

export type EchoEntitlements = {
  plan: EchoPlanId;
  phoneVerifiedForUploadBump: boolean;
  uploadMaxBytes: number;
  maxJoinedServers: number | null;
  groupDmMaxMembers: number;
};

type Queryable = Pick<pg.Pool, 'query'>;

async function selectPlanAndPhone(
  pool: Queryable,
  userId: string,
): Promise<{ plan: EchoPlanId; phoneVerifiedForUploadBump: boolean }> {
  try {
    const r = await pool.query(
      `
      SELECT
        COALESCE(NULLIF(TRIM(echo_plan), ''), 'free') AS echo_plan,
        (phone_e164 IS NOT NULL AND phone_verified_at IS NOT NULL) AS phone_ok
      FROM auth_users
      WHERE id = $1
      LIMIT 1
      `,
      [userId],
    );
    const row = r.rows[0];
    if (!row) {
      return { plan: 'free', phoneVerifiedForUploadBump: false };
    }
    return {
      plan: normalizeEchoPlanId(row.echo_plan),
      phoneVerifiedForUploadBump: Boolean(row.phone_ok),
    };
  } catch (e) {
    if (
      isPostgresUndefinedColumnError(e) &&
      /\becho_plan\b/i.test(String((e as Error).message))
    ) {
      const r = await pool.query(
        `
        SELECT (phone_e164 IS NOT NULL AND phone_verified_at IS NOT NULL) AS phone_ok
        FROM auth_users WHERE id = $1 LIMIT 1
        `,
        [userId],
      );
      return {
        plan: 'free',
        phoneVerifiedForUploadBump: Boolean(r.rows[0]?.phone_ok),
      };
    }
    throw e;
  }
}

function resolveUploadMaxBytes(
  plan: EchoPlanId,
  phoneVerifiedForUploadBump: boolean,
): number {
  if (plan !== 'free') return ECHO_PLAN_UPLOAD_CAP_BYTES[plan];
  if (phoneVerifiedForUploadBump) {
    return Math.max(
      ECHO_PLAN_UPLOAD_CAP_BYTES.free,
      ECHO_FREE_PHONE_VERIFIED_UPLOAD_CAP_BYTES,
    );
  }
  return ECHO_PLAN_UPLOAD_CAP_BYTES.free;
}

export async function getEchoEntitlements(
  pool: Queryable,
  userId: string,
): Promise<EchoEntitlements> {
  const { plan, phoneVerifiedForUploadBump } = await selectPlanAndPhone(
    pool,
    userId,
  );
  return {
    plan,
    phoneVerifiedForUploadBump,
    uploadMaxBytes: resolveUploadMaxBytes(plan, phoneVerifiedForUploadBump),
    maxJoinedServers: ECHO_PLAN_MAX_JOINED_SERVERS[plan],
    groupDmMaxMembers: ECHO_PLAN_GROUP_DM_MAX_MEMBERS[plan],
  };
}

export async function countEchoJoinedServersForUser(
  pool: Queryable,
  userId: string,
): Promise<number> {
  const r = await pool.query(
    `
    SELECT COUNT(*)::int AS c
    FROM echo_server_members m
    WHERE m.user_id = $1 AND m.server_id <> $2
    `,
    [userId, ECHO_DM_REALM_SERVER_ID],
  );
  return Number(r.rows[0]?.c ?? 0);
}

export async function assertEchoUserHasServerMembershipSlot(
  pool: Queryable,
  userId: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      code: 'SERVER_LIMIT';
      max: number;
      current: number;
    }
> {
  const ent = await getEchoEntitlements(pool, userId);
  if (ent.maxJoinedServers == null) return { ok: true };

  const current = await countEchoJoinedServersForUser(pool, userId);
  if (current >= ent.maxJoinedServers) {
    return {
      ok: false,
      code: 'SERVER_LIMIT',
      max: ent.maxJoinedServers,
      current,
    };
  }
  return { ok: true };
}

export async function assertCanJoinNewEchoServer(
  pool: pg.Pool,
  userId: string,
  targetServerId: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      code: 'SERVER_LIMIT';
      max: number;
      current: number;
    }
> {
  const mem = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2 LIMIT 1`,
    [targetServerId, userId],
  );
  if (mem.rows.length > 0) return { ok: true };

  return assertEchoUserHasServerMembershipSlot(pool, userId);
}

export async function buildEchoPlanLimitsPublic(
  pool: pg.Pool,
  userId: string,
): Promise<EchoPlanLimitsPublic> {
  const ent = await getEchoEntitlements(pool, userId);
  const joinedServerCount = await countEchoJoinedServersForUser(pool, userId);
  const imageSearchesPerDay = ECHO_PLAN_IMAGE_SEARCHES_PER_DAY[ent.plan];
  const imageUsage = await readUserImageSearchUsage(
    userId,
    imageSearchesPerDay,
  );
  return {
    plan: ent.plan,
    uploadMaxBytes: ent.uploadMaxBytes,
    maxJoinedServers: ent.maxJoinedServers,
    joinedServerCount,
    groupDmMaxMembers: ent.groupDmMaxMembers,
    themeTier: ECHO_PLAN_THEME_TIER[ent.plan],
    features: ECHO_PLAN_FEATURE_FLAGS[ent.plan],
    imageSearchesPerDay,
    imageSearchesUsedToday: imageUsage.used,
    watchTogetherMaxVideoBytes: ECHO_WATCH_TOGETHER_MAX_VIDEO_BYTES,
    watchTogetherMaxSessionBytes: ECHO_WATCH_TOGETHER_MAX_SESSION_BYTES,
  };
}
