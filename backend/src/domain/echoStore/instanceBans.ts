import type pg from 'pg';
import { parseClientIpForBan } from '../../net/clientIp';
import { nextEchoSnowflakeId } from '../echoSnowflake';
import {
  authHwidAccountCapActive,
  hashClientHwidForProfile,
  normalizeClientHwid,
} from '../../services/auth/hwidAccountProfile';
import { deleteAllServerSessionsForUser } from '../../auth/serverSession';

export type InstanceBanDimension = 'userId' | 'ip' | 'hwid';

export type InstanceBanRow = {
  id: string;
  createdAt: string;
  reason: string;
  userId: string | null;
  ip: string | null;
  hwidHash: string | null;
  expiresAt: string | null;
  isAllowlisted: boolean;
  isPropagated: boolean;
  originBanId: string | null;
  bannedBy: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
};

export type EvaluateInstanceBanResult = {
  blocked: boolean;
  hits: InstanceBanDimension[];
  reason: string | null;
};

export type CreateInstanceBanInput = {
  reason: string;
  userId?: string | null;
  rawIp?: string | null;
  hwidHash?: string | null;
  expiresAt?: Date | null;
  isAllowlisted?: boolean;
  bannedBy: string;
  includeLastSeenIp?: boolean;
  includeKnownHwid?: boolean;
};

function isoFromDb(value: unknown): string {
  return new Date(value as string | number | Date).toISOString();
}

function mapRow(row: Record<string, unknown>): InstanceBanRow {
  return {
    id: String(row.id),
    createdAt: isoFromDb(row.created_at),
    reason: String(row.reason ?? ''),
    userId: row.user_id != null ? String(row.user_id) : null,
    ip: row.ip != null ? String(row.ip) : null,
    hwidHash: row.hwid_hash != null ? String(row.hwid_hash) : null,
    expiresAt: row.expires_at != null ? isoFromDb(row.expires_at) : null,
    isAllowlisted: Boolean(row.is_allowlisted),
    isPropagated: Boolean(row.is_propagated),
    originBanId: row.origin_ban_id != null ? String(row.origin_ban_id) : null,
    bannedBy: row.banned_by != null ? String(row.banned_by) : null,
    revokedAt: row.revoked_at != null ? isoFromDb(row.revoked_at) : null,
    revokedBy: row.revoked_by != null ? String(row.revoked_by) : null,
  };
}

export function resolveHwidHashFromClientHwid(
  clientHwid: string | undefined | null,
): string | null {
  if (!authHwidAccountCapActive()) return null;
  const normalized = normalizeClientHwid(clientHwid);
  if (!normalized) return null;
  return hashClientHwidForProfile(normalized);
}

async function insertAudit(
  pool: pg.Pool,
  params: {
    operatorId: string;
    action: string;
    banId?: string | null;
    targetUserId?: string | null;
    detail?: Record<string, unknown> | null;
  },
): Promise<void> {
  await pool.query(
    `
    INSERT INTO echo_instance_ban_audit (id, operator_id, action, ban_id, target_user_id, detail)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      nextEchoSnowflakeId(),
      params.operatorId,
      params.action,
      params.banId ?? null,
      params.targetUserId ?? null,
      params.detail ? JSON.stringify(params.detail) : null,
    ],
  );
}

export async function evaluateInstanceBan(
  pool: pg.Pool,
  ctx: {
    userId?: string | null;
    rawIp?: string | null;
    hwidHash?: string | null;
  },
): Promise<EvaluateInstanceBanResult> {
  const userId = ctx.userId?.trim() || null;
  const ip = parseClientIpForBan(ctx.rawIp ?? undefined);
  const hwidHash = ctx.hwidHash?.trim() || null;

  if (!userId && !ip && !hwidHash) {
    return { blocked: false, hits: [], reason: null };
  }

  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (userId) {
    conditions.push(`user_id = $${i++}`);
    values.push(userId);
  }
  if (ip) {
    conditions.push(`ip = $${i++}::inet`);
    values.push(ip);
  }
  if (hwidHash) {
    conditions.push(`hwid_hash = $${i++}`);
    values.push(hwidHash);
  }

  const r = await pool.query(
    `
    SELECT id, reason, user_id, ip, hwid_hash, is_allowlisted
    FROM echo_instance_bans
    WHERE revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
      AND (${conditions.join(' OR ')})
    `,
    values,
  );

  const banHits = new Set<InstanceBanDimension>();
  const allowHits = new Set<InstanceBanDimension>();
  let reason: string | null = null;

  for (const row of r.rows) {
    const rowReason = typeof row.reason === 'string' ? row.reason.trim() : '';
    if (rowReason && !reason) reason = rowReason.slice(0, 500);

    const dims: InstanceBanDimension[] = [];
    if (userId && row.user_id === userId) dims.push('userId');
    if (ip && row.ip != null && String(row.ip) === ip) dims.push('ip');
    if (hwidHash && row.hwid_hash === hwidHash) dims.push('hwid');

    for (const dim of dims) {
      if (row.is_allowlisted) allowHits.add(dim);
      else banHits.add(dim);
    }
  }

  const hits = [...banHits].filter((dim) => !allowHits.has(dim));
  return {
    blocked: hits.length > 0,
    hits,
    reason,
  };
}

async function insertBanRow(
  pool: pg.Pool,
  params: {
    reason: string;
    userId?: string | null;
    ip?: string | null;
    hwidHash?: string | null;
    expiresAt?: Date | null;
    isAllowlisted: boolean;
    bannedBy: string;
    originBanId?: string | null;
    isPropagated?: boolean;
  },
): Promise<InstanceBanRow> {
  const id = nextEchoSnowflakeId();
  const r = await pool.query(
    `
    INSERT INTO echo_instance_bans (
      id, reason, user_id, ip, hwid_hash, expires_at,
      is_allowlisted, is_propagated, origin_ban_id, banned_by
    )
    VALUES (
      $1, $2, $3,
      CASE WHEN $4::text IS NULL THEN NULL ELSE $4::inet END,
      $5, $6, $7, $8, $9, $10
    )
    RETURNING *
    `,
    [
      id,
      params.reason.slice(0, 500),
      params.userId ?? null,
      params.ip ?? null,
      params.hwidHash ?? null,
      params.expiresAt ?? null,
      params.isAllowlisted,
      params.isPropagated ?? false,
      params.originBanId ?? null,
      params.bannedBy,
    ],
  );
  return mapRow(r.rows[0] as Record<string, unknown>);
}

async function loadUserBanContext(
  pool: pg.Pool,
  userId: string,
): Promise<{ lastSeenIp: string | null; hwidHash: string | null }> {
  const u = await pool.query<{ last_seen_ip: string | null }>(
    `SELECT last_seen_ip FROM auth_users WHERE id = $1`,
    [userId],
  );
  const lastSeenIp = parseClientIpForBan(u.rows[0]?.last_seen_ip ?? undefined);
  const hw = await pool.query<{ hwid_hash: string }>(
    `
    SELECT hwid_hash FROM auth_hwid_account_registrations
    WHERE user_id = $1
    ORDER BY id DESC
    LIMIT 1
    `,
    [userId],
  );
  const hwidHash = hw.rows[0]?.hwid_hash?.trim() || null;
  return { lastSeenIp, hwidHash };
}

export async function createInstanceBan(
  pool: pg.Pool,
  input: CreateInstanceBanInput,
): Promise<InstanceBanRow[]> {
  const reason = input.reason.trim().slice(0, 500);
  if (!reason) throw new Error('REASON_REQUIRED');

  const userId = input.userId?.trim() || null;
  let ip = parseClientIpForBan(input.rawIp ?? undefined);
  let hwidHash = input.hwidHash?.trim() || null;

  if (userId) {
    const ctx = await loadUserBanContext(pool, userId);
    if ((input.includeLastSeenIp ?? true) && !ip && ctx.lastSeenIp) {
      ip = ctx.lastSeenIp;
    }
    if ((input.includeKnownHwid ?? true) && !hwidHash && ctx.hwidHash) {
      hwidHash = ctx.hwidHash;
    }
  }

  if (!userId && !ip && !hwidHash) {
    throw new Error('TARGET_REQUIRED');
  }

  const expiresAt = input.expiresAt ?? null;
  const isAllowlisted = Boolean(input.isAllowlisted);
  const created: InstanceBanRow[] = [];
  let primaryId: string | null = null;

  const addRow = async (params: {
    userId?: string | null;
    ip?: string | null;
    hwidHash?: string | null;
    isPropagated?: boolean;
  }) => {
    const row = await insertBanRow(pool, {
      reason,
      userId: params.userId ?? null,
      ip: params.ip ?? null,
      hwidHash: params.hwidHash ?? null,
      expiresAt,
      isAllowlisted,
      bannedBy: input.bannedBy,
      originBanId: primaryId,
      isPropagated: params.isPropagated ?? false,
    });
    if (!primaryId) primaryId = row.id;
    created.push(row);
  };

  if (userId) await addRow({ userId });
  if (ip) await addRow({ ip, isPropagated: Boolean(userId) });
  if (hwidHash) await addRow({ hwidHash, isPropagated: Boolean(userId) });

  await insertAudit(pool, {
    operatorId: input.bannedBy,
    action: isAllowlisted ? 'allowlist_create' : 'ban_create',
    banId: created[0]?.id ?? null,
    targetUserId: userId,
    detail: { banIds: created.map((b) => b.id), count: created.length },
  });

  if (userId && !isAllowlisted) {
    await deleteAllServerSessionsForUser(userId);
  }

  return created;
}

export async function revokeInstanceBan(
  pool: pg.Pool,
  banId: string,
  operatorId: string,
): Promise<InstanceBanRow | null> {
  const r = await pool.query(
    `
    UPDATE echo_instance_bans
    SET revoked_at = NOW(), revoked_by = $2
    WHERE id = $1 AND revoked_at IS NULL
    RETURNING *
    `,
    [banId.trim(), operatorId],
  );
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const mapped = mapRow(row);
  await insertAudit(pool, {
    operatorId,
    action: 'ban_revoke',
    banId: mapped.id,
    targetUserId: mapped.userId,
  });
  return mapped;
}

export async function listInstanceBans(
  pool: pg.Pool,
  opts: {
    limit?: number;
    cursor?: string | null;
    userId?: string | null;
    ip?: string | null;
    hwidHash?: string | null;
    includeRevoked?: boolean;
  },
): Promise<{ bans: InstanceBanRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const filters: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (!opts.includeRevoked) {
    filters.push('revoked_at IS NULL');
    filters.push('(expires_at IS NULL OR expires_at > NOW())');
  }
  if (opts.userId?.trim()) {
    filters.push(`user_id = $${i++}`);
    values.push(opts.userId.trim());
  }
  const ip = parseClientIpForBan(opts.ip ?? undefined);
  if (ip) {
    filters.push(`ip = $${i++}::inet`);
    values.push(ip);
  }
  if (opts.hwidHash?.trim()) {
    filters.push(`hwid_hash = $${i++}`);
    values.push(opts.hwidHash.trim());
  }
  if (opts.cursor?.trim()) {
    filters.push(`id < $${i++}`);
    values.push(opts.cursor.trim());
  }

  values.push(limit + 1);
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const r = await pool.query(
    `
    SELECT *
    FROM echo_instance_bans
    ${where}
    ORDER BY id DESC
    LIMIT $${i}
    `,
    values,
  );

  const rows = r.rows
    .slice(0, limit)
    .map((row) => mapRow(row as Record<string, unknown>));
  const nextCursor =
    r.rows.length > limit ? (rows[rows.length - 1]?.id ?? null) : null;
  return { bans: rows, nextCursor };
}

export {
  countInstanceOperators,
  setUserInstanceOperator,
} from './instanceBanOperators';
