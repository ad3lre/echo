import type pg from 'pg';
import { nextEchoSnowflakeId } from '../echoSnowflake';

export async function insertEchoAudit(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  meta?: unknown,
): Promise<string> {
  const id = nextEchoSnowflakeId();
  await pool.query(
    `INSERT INTO echo_audit_log (id, server_id, actor_id, action, target_type, target_id, meta) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      id,
      serverId,
      actorId,
      action,
      targetType,
      targetId,
      meta !== undefined ? JSON.stringify(meta) : null,
    ],
  );
  return id;
}

export async function getEchoWorkspaceVersionForServers(
  pool: pg.Pool,
  serverIds: string[],
): Promise<string> {
  if (serverIds.length === 0) return '0';
  const r = await pool.query(
    `
    SELECT COALESCE(MAX(id), '0') AS version
    FROM echo_audit_log
    WHERE server_id = ANY($1::text[])
    `,
    [serverIds],
  );
  return String(r.rows[0]?.version ?? '0');
}

export type EchoAuditLogRow = {
  id: string;
  actor_id: string;
  /** Resolved label for UI (display name, username, or Unknown). */
  actor_label: string;
  action: string;
  target_type: string;
  target_id: string;
  meta: unknown;
  created_at: string;
};

export async function listEchoAuditLogForServer(
  pool: pg.Pool,
  serverId: string,
  limit: number,
  opts?: { actorId?: string },
): Promise<EchoAuditLogRow[]> {
  const actorId = opts?.actorId?.trim() || null;
  const r = await pool.query(
    `
    SELECT
      a.id,
      a.actor_id,
      a.action,
      a.target_type,
      a.target_id,
      a.meta,
      a.created_at,
      COALESCE(NULLIF(TRIM(au.display_name), ''), NULLIF(TRIM(au.username), ''), 'Unknown') AS actor_label
    FROM echo_audit_log a
    LEFT JOIN auth_users au ON au.id = a.actor_id
    WHERE a.server_id = $1
      AND ($3::text IS NULL OR a.actor_id = $3)
    ORDER BY a.created_at DESC
    LIMIT $2
    `,
    [serverId, limit, actorId],
  );
  return r.rows.map((row: any) => ({
    id: String(row.id),
    actor_id: String(row.actor_id),
    actor_label: String(row.actor_label ?? 'Unknown'),
    action: String(row.action),
    target_type: String(row.target_type),
    target_id: String(row.target_id),
    meta: row.meta ?? null,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  }));
}

export type EchoServerBanRow = {
  userId: string;
  username: string;
  displayName: string;
  pfp: string;
  createdAt: string;
  /** ISO timestamp when the ban lifts, or null for permanent. */
  expiresAt: string | null;
  reason: string | null;
  bannedByLabel: string;
};

/** Active bans for a server (joined to auth_users for display). Expired rows are omitted. */
export async function listEchoServerBans(
  pool: pg.Pool,
  serverId: string,
): Promise<EchoServerBanRow[]> {
  const r = await pool.query(
    `
    SELECT
      b.user_id,
      b.created_at,
      b.expires_at,
      b.reason,
      u.username,
      u.display_name,
      u.pfp,
      COALESCE(NULLIF(TRIM(mod.display_name), ''), NULLIF(TRIM(mod.username), ''), '') AS moderator_label
    FROM echo_server_bans b
    LEFT JOIN auth_users u ON u.id = b.user_id
    LEFT JOIN auth_users mod ON mod.id = b.banned_by
    WHERE b.server_id = $1
      AND (b.expires_at IS NULL OR b.expires_at > NOW())
    ORDER BY b.created_at DESC
    `,
    [serverId],
  );
  return r.rows.map((row: any) => ({
    userId: String(row.user_id),
    username: String(row.username ?? '').trim() || 'unknown',
    displayName: String(row.display_name ?? '').trim() || 'Deleted user',
    pfp: String(row.pfp ?? ''),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    expiresAt:
      row.expires_at instanceof Date
        ? row.expires_at.toISOString()
        : row.expires_at
          ? String(row.expires_at)
          : null,
    reason:
      row.reason != null && String(row.reason).trim() !== ''
        ? String(row.reason)
        : null,
    bannedByLabel: String(row.moderator_label ?? '').trim() || '—',
  }));
}

export async function listEchoModerationHistoryForServer(
  pool: pg.Pool,
  serverId: string,
  limit: number,
  targetUserId?: string,
): Promise<EchoAuditLogRow[]> {
  const selectFrom = `
    SELECT
      a.id,
      a.actor_id,
      a.action,
      a.target_type,
      a.target_id,
      a.meta,
      a.created_at,
      COALESCE(NULLIF(TRIM(au.display_name), ''), NULLIF(TRIM(au.username), ''), 'Unknown') AS actor_label
    FROM echo_audit_log a
    LEFT JOIN auth_users au ON au.id = a.actor_id
  `;
  if (targetUserId) {
    const r = await pool.query(
      `${selectFrom}
      WHERE a.server_id = $1 AND a.action LIKE 'moderation.%' AND a.target_id = $2
      ORDER BY a.created_at DESC
      LIMIT $3
      `,
      [serverId, targetUserId, limit],
    );
    return r.rows.map((row: any) => ({
      id: String(row.id),
      actor_id: String(row.actor_id),
      actor_label: String(row.actor_label ?? 'Unknown'),
      action: String(row.action),
      target_type: String(row.target_type),
      target_id: String(row.target_id),
      meta: row.meta ?? null,
      created_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
    }));
  }
  const r = await pool.query(
    `${selectFrom}
    WHERE a.server_id = $1 AND a.action LIKE 'moderation.%'
    ORDER BY a.created_at DESC
    LIMIT $2
    `,
    [serverId, limit],
  );
  return r.rows.map((row: any) => ({
    id: String(row.id),
    actor_id: String(row.actor_id),
    actor_label: String(row.actor_label ?? 'Unknown'),
    action: String(row.action),
    target_type: String(row.target_type),
    target_id: String(row.target_id),
    meta: row.meta ?? null,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  }));
}
