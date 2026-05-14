import { randomBytes } from 'node:crypto';
import type pg from 'pg';

function genInviteCode(): string {
  return randomBytes(8).toString('hex');
}

export async function createEchoInvite(
  pool: pg.Pool,
  serverId: string,
  inviterId: string,
): Promise<string> {
  const code = genInviteCode();
  await pool.query(
    `INSERT INTO echo_invites (code, server_id, inviter_id) VALUES ($1, $2, $3)`,
    [code, serverId, inviterId],
  );
  return code;
}

export async function resolveEchoInvite(
  pool: pg.Pool,
  code: string,
): Promise<{ serverId: string } | null> {
  const r = await pool.query(
    `SELECT server_id FROM echo_invites WHERE code = $1`,
    [code.trim()],
  );
  if (!r.rows[0]) return null;
  return { serverId: String(r.rows[0].server_id) };
}

/** Empty string = clear vanity; null = invalid format. */
export function normalizeEchoVanityCode(raw: string): string | null {
  const t = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (t === '') return '';
  if (t.length < 3 || t.length > 32) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t)) return null;
  return t;
}

/** Invite hex code first, then server vanity slug. */
export async function resolveEchoInviteTarget(
  pool: pg.Pool,
  token: string,
): Promise<{ serverId: string } | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const fromInvite = await resolveEchoInvite(pool, trimmed);
  if (fromInvite) return fromInvite;
  const nv = normalizeEchoVanityCode(trimmed);
  if (nv === null || nv === '') return null;
  const v = await pool.query(
    `SELECT id FROM echo_servers WHERE LOWER(vanity_code) = $1 AND vanity_code <> '' LIMIT 1`,
    [nv],
  );
  if (v.rows[0]) return { serverId: String(v.rows[0].id) };
  return null;
}

/** Public invite card data (chat embeds, share sheets). No auth — same disclosure model as opening the invite URL. */
export type EchoInvitePreview = {
  name: string;
  iconUrl: string;
  bannerUrl: string;
  description: string;
  memberCount: number;
  /** When `voiceChannelId` was requested and valid on this server. */
  voiceChannel?: { id: string; name: string };
};

export async function getEchoInvitePreview(
  pool: pg.Pool,
  token: string,
  voiceChannelId?: string | null,
): Promise<EchoInvitePreview | null> {
  const target = await resolveEchoInviteTarget(pool, token);
  if (!target) return null;
  const r = await pool.query(
    `
    SELECT s.name, s.icon_url, s.banner_url, s.description,
           (SELECT COUNT(*)::int FROM echo_server_members m WHERE m.server_id = s.id) AS member_count
    FROM echo_servers s
    WHERE s.id = $1
    LIMIT 1
    `,
    [target.serverId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const mc = row.member_count;
  const memberCount =
    typeof mc === 'number' && Number.isFinite(mc)
      ? mc
      : typeof mc === 'string'
        ? parseInt(mc, 10) || 0
        : Number(mc) || 0;
  const base: EchoInvitePreview = {
    name: String(row.name ?? 'Server').trim() || 'Server',
    iconUrl: String(row.icon_url ?? '').trim(),
    bannerUrl: String(row.banner_url ?? '').trim(),
    description: String(row.description ?? '').trim(),
    memberCount,
  };
  const vcId = typeof voiceChannelId === 'string' ? voiceChannelId.trim() : '';
  if (!vcId) return base;
  const ch = await pool.query(
    `SELECT ch.id, ch.name FROM echo_channels ch
     WHERE ch.id = $1 AND ch.server_id = $2 AND ch.type = 'voice'
       AND EXISTS (
         SELECT 1 FROM echo_roles r
         WHERE r.server_id = ch.server_id AND r.name = '@everyone'
           AND (r.permissions ? 'VIEW_CHANNEL')
           AND NOT EXISTS (
             SELECT 1 FROM echo_channel_permission_overwrite_rows ow
             WHERE ow.channel_id = ch.id
               AND (ow.target_type = 'everyone' OR (ow.target_type = 'role' AND ow.target_id = r.id))
               AND (ow.partial->>'VIEW_CHANNEL')::boolean = false
           )
           AND NOT EXISTS (
             SELECT 1 FROM echo_category_permission_overwrite_rows cow
             WHERE cow.category_id = ch.category_id
               AND (cow.target_type = 'everyone' OR (cow.target_type = 'role' AND cow.target_id = r.id))
               AND (cow.partial->>'VIEW_CHANNEL')::boolean = false
           )
       )
     LIMIT 1`,
    [vcId, target.serverId],
  );
  const crow = ch.rows[0];
  if (!crow) return base;
  return {
    ...base,
    voiceChannel: {
      id: String(crow.id ?? '').trim(),
      name: String(crow.name ?? 'Voice').trim() || 'Voice',
    },
  };
}
