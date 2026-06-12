import type pg from 'pg';

/** Row snapshot for `channel.patch` audit (before/after). */
export type EchoChannelAuditSnapshotRow = {
  permission_overrides: unknown;
  name: string;
  category_id: string;
  slowmode_seconds: number;
  user_limit: number;
  bitrate_bps: unknown;
  voice_e2ee_enabled: boolean;
  nsfw: boolean;
  icon_key: string;
  message_format_template: string;
  message_format_hard: boolean;
};

export async function getEchoChannelAuditSnapshot(
  pool: pg.Pool,
  channelId: string,
  serverId: string,
): Promise<EchoChannelAuditSnapshotRow | undefined> {
  const r = await pool.query(
    `SELECT permission_overrides, name, category_id, slowmode_seconds, user_limit, bitrate_bps, voice_e2ee_enabled, nsfw, icon_key, message_format_template, message_format_hard FROM echo_channels WHERE id = $1 AND server_id = $2 LIMIT 1`,
    [channelId, serverId],
  );
  return r.rows[0] as EchoChannelAuditSnapshotRow | undefined;
}

export async function getEchoCategoryPermissionOverridesPrevious(
  pool: pg.Pool,
  serverId: string,
  categoryId: string,
): Promise<unknown | null> {
  const r = await pool.query(
    `SELECT permission_overrides FROM echo_category_permission_overrides WHERE server_id = $1 AND category_id = $2 LIMIT 1`,
    [serverId, categoryId],
  );
  return r.rows[0]?.permission_overrides ?? null;
}

export type EchoRoleAuditMetaRow = {
  name: string;
  color: string;
  hoist: boolean;
  default_on_join: boolean;
  permissions: unknown;
};

export async function getEchoRoleAuditMeta(
  pool: pg.Pool,
  serverId: string,
  roleId: string,
): Promise<EchoRoleAuditMetaRow | null> {
  const r = await pool.query(
    `SELECT name, color, hoist, default_on_join, permissions FROM echo_roles WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, roleId],
  );
  if (r.rows.length === 0) return null;
  return r.rows[0] as EchoRoleAuditMetaRow;
}

export async function getEchoRolePermissionsColumn(
  pool: pg.Pool,
  serverId: string,
  roleId: string,
): Promise<unknown> {
  const r = await pool.query(
    `SELECT permissions FROM echo_roles WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, roleId],
  );
  return r.rows[0]?.permissions;
}

export async function getEchoRoleMetadataDisplay(
  pool: pg.Pool,
  serverId: string,
  roleId: string,
): Promise<{
  name: string;
  color: string;
  hoist: boolean;
  default_on_join: boolean;
} | null> {
  const r = await pool.query(
    `SELECT name, color, hoist, default_on_join FROM echo_roles WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, roleId],
  );
  if (!r.rows[0]) return null;
  return r.rows[0] as {
    name: string;
    color: string;
    hoist: boolean;
    default_on_join: boolean;
  };
}
