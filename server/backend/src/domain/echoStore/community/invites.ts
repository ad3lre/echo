import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import {
  echoApplicationFormForClient,
  parseEchoApplicationFormFromDb,
  type EchoApplicationForm,
} from '../onboarding/applicationForm';
import {
  listEchoServerMemberHighlights,
  type EchoServerMemberHighlight,
} from '../members/memberHighlights';

function genInviteCode(): string {
  return randomBytes(8).toString('hex');
}

/** When false, new members cannot join via vanity or token invites (existing members unaffected). */
export async function echoServerAllowsInviteJoin(
  pool: pg.Pool,
  serverId: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT invite_join_enabled FROM echo_servers WHERE id = $1 LIMIT 1`,
    [serverId],
  );
  if (!r.rows[0]) return false;
  return r.rows[0].invite_join_enabled !== false;
}

/** Default lifetime for new invites (7 days). */
export const ECHO_INVITE_DEFAULT_MAX_AGE_SEC = 7 * 24 * 60 * 60;
/** Longest finite lifetime accepted from clients (30 days). */
export const ECHO_INVITE_MAX_AGE_SEC_CAP = 30 * 24 * 60 * 60;
export const ECHO_INVITE_MAX_USES_CAP = 1000;

/** SQL predicate: invite row is currently usable (not revoked, expired, or exhausted). */
const INVITE_ACTIVE_SQL = `revoked_at IS NULL
  AND (expires_at IS NULL OR expires_at > NOW())
  AND (max_uses IS NULL OR uses < max_uses)`;

export type CreateEchoInviteOpts = {
  skipsApplication?: boolean;
  /** Seconds until expiry. 0 = never (caller must enforce MANAGE_GUILD). Default 7 days. */
  maxAgeSec?: number;
  /** Max successful joins. 0/undefined = unlimited (except skip-application invites default to 1). */
  maxUses?: number;
};

/** Resolve effective expiry (seconds, null = never) and max uses (null = unlimited). */
export function resolveEchoInviteLimits(opts?: CreateEchoInviteOpts): {
  maxAgeSec: number | null;
  maxUses: number | null;
} {
  const skip = opts?.skipsApplication === true;
  let age = opts?.maxAgeSec;
  if (typeof age !== 'number' || !Number.isFinite(age) || age < 0) {
    age = ECHO_INVITE_DEFAULT_MAX_AGE_SEC;
  }
  age = Math.floor(age);
  let maxAgeSec: number | null = age === 0 ? null : age;
  if (
    skip &&
    (maxAgeSec === null || maxAgeSec > ECHO_INVITE_DEFAULT_MAX_AGE_SEC)
  ) {
    maxAgeSec = ECHO_INVITE_DEFAULT_MAX_AGE_SEC;
  }
  let uses: number | null = null;
  const mu = opts?.maxUses;
  if (typeof mu === 'number' && Number.isFinite(mu) && mu > 0) {
    uses = Math.min(Math.floor(mu), ECHO_INVITE_MAX_USES_CAP);
  } else if (skip) {
    uses = 1;
  }
  return { maxAgeSec, maxUses: uses };
}

export async function createEchoInvite(
  pool: pg.Pool,
  serverId: string,
  inviterId: string,
  opts?: CreateEchoInviteOpts,
): Promise<string> {
  const code = genInviteCode();
  const skip = opts?.skipsApplication === true;
  const { maxAgeSec, maxUses } = resolveEchoInviteLimits(opts);
  await pool.query(
    `INSERT INTO echo_invites (code, server_id, inviter_id, skips_application, expires_at, max_uses)
     VALUES ($1, $2, $3, $4, CASE WHEN $5::int IS NULL THEN NULL ELSE NOW() + ($5::int * INTERVAL '1 second') END, $6)`,
    [code, serverId, inviterId, skip, maxAgeSec, maxUses],
  );
  return code;
}

/**
 * Atomically consume one use of an invite at actual new-member join.
 * Returns false when the invite is invalid, revoked, expired, or exhausted.
 */
export async function consumeEchoInvite(
  db: Pick<pg.Pool, 'query'>,
  code: string,
  serverId: string,
): Promise<boolean> {
  const r = await db.query(
    `UPDATE echo_invites SET uses = uses + 1
     WHERE code = $1 AND server_id = $2 AND ${INVITE_ACTIVE_SQL}
     RETURNING code`,
    [code.trim(), serverId],
  );
  return r.rows.length > 0;
}

export type RevokeEchoInviteResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'forbidden' };

/** Revoke an invite. Allowed for its inviter or when `canManageGuild` is true. */
export async function revokeEchoInvite(
  pool: pg.Pool,
  serverId: string,
  code: string,
  actorId: string,
  canManageGuild: boolean,
): Promise<RevokeEchoInviteResult> {
  const r = await pool.query(
    `SELECT inviter_id FROM echo_invites WHERE code = $1 AND server_id = $2 LIMIT 1`,
    [code.trim(), serverId],
  );
  if (!r.rows[0]) return { ok: false, reason: 'not_found' };
  if (!canManageGuild && String(r.rows[0].inviter_id) !== actorId) {
    return { ok: false, reason: 'forbidden' };
  }
  await pool.query(
    `UPDATE echo_invites SET revoked_at = COALESCE(revoked_at, NOW()) WHERE code = $1 AND server_id = $2`,
    [code.trim(), serverId],
  );
  return { ok: true };
}

export async function resolveEchoInvite(
  pool: pg.Pool,
  code: string,
): Promise<{ serverId: string } | null> {
  const r = await pool.query(
    `SELECT server_id FROM echo_invites WHERE code = $1 AND ${INVITE_ACTIVE_SQL}`,
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

/** Hex invite row or vanity slug → server; used for join gating. */
export type EchoInviteJoinContext = {
  serverId: string;
  pathKind: 'hex' | 'vanity';
  /** Hex code when `pathKind === 'hex'`. */
  inviteCode: string | null;
  skipsApplication: boolean;
};

export async function resolveEchoInviteJoinContext(
  pool: pg.Pool,
  token: string,
): Promise<EchoInviteJoinContext | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const hex = await pool.query(
    `SELECT server_id, skips_application FROM echo_invites WHERE code = $1 AND ${INVITE_ACTIVE_SQL} LIMIT 1`,
    [trimmed],
  );
  if (hex.rows[0]) {
    return {
      serverId: String(hex.rows[0].server_id),
      pathKind: 'hex',
      inviteCode: trimmed,
      skipsApplication: Boolean(hex.rows[0].skips_application),
    };
  }
  const nv = normalizeEchoVanityCode(trimmed);
  if (nv === null || nv === '') return null;
  const v = await pool.query(
    `SELECT id FROM echo_servers WHERE LOWER(vanity_code) = $1 AND vanity_code <> '' LIMIT 1`,
    [nv],
  );
  if (!v.rows[0]) return null;
  return {
    serverId: String(v.rows[0].id),
    pathKind: 'vanity',
    inviteCode: null,
    skipsApplication: false,
  };
}

/** Invite hex code first, then server vanity slug. */
export async function resolveEchoInviteTarget(
  pool: pg.Pool,
  token: string,
): Promise<{ serverId: string } | null> {
  const ctx = await resolveEchoInviteJoinContext(pool, token);
  return ctx ? { serverId: ctx.serverId } : null;
}

/** Public invite card data (chat embeds, share sheets). No auth — same disclosure model as opening the invite URL. */
export type EchoInvitePreview = {
  name: string;
  iconUrl: string;
  bannerUrl: string;
  description: string;
  memberCount: number;
  /** Echo snowflake — used when join requires an application. */
  serverId?: string;
  requiresApplication?: boolean;
  skipsApplication?: boolean;
  applicationForm?: EchoApplicationForm;
  /** When `voiceChannelId` was requested and valid on this server. */
  voiceChannel?: { id: string; name: string };
  /** Owner + highest-role members for pre-join social proof. */
  topMembers?: EchoServerMemberHighlight[];
};

export async function getEchoInvitePreview(
  pool: pg.Pool,
  token: string,
  voiceChannelId?: string | null,
): Promise<EchoInvitePreview | null> {
  const joinCtx = await resolveEchoInviteJoinContext(pool, token);
  if (!joinCtx) return null;
  const r = await pool.query(
    `
    SELECT s.id, s.name, s.icon_url, s.banner_url, s.description,
           s.applications_enabled, s.application_form,
           s.member_count AS member_count
    FROM echo_servers s
    WHERE s.id = $1
    LIMIT 1
    `,
    [joinCtx.serverId],
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
  const appsOn = Boolean(row.applications_enabled);
  const formRaw = parseEchoApplicationFormFromDb(row.application_form);
  const requiresApplication = appsOn && !joinCtx.skipsApplication;
  const base: EchoInvitePreview = {
    name: String(row.name ?? 'Server').trim() || 'Server',
    iconUrl: String(row.icon_url ?? '').trim(),
    bannerUrl: String(row.banner_url ?? '').trim(),
    description: String(row.description ?? '').trim(),
    memberCount,
    serverId: String(row.id),
    requiresApplication,
    skipsApplication: joinCtx.skipsApplication,
    ...(requiresApplication && formRaw
      ? { applicationForm: echoApplicationFormForClient(formRaw) }
      : {}),
  };
  const highlights = await listEchoServerMemberHighlights(
    pool,
    joinCtx.serverId,
  );
  const withHighlights: EchoInvitePreview =
    highlights.length > 0 ? { ...base, topMembers: highlights } : base;

  const vcId = typeof voiceChannelId === 'string' ? voiceChannelId.trim() : '';
  if (!vcId) return withHighlights;
  const ch = await pool.query(
    `SELECT ch.id, ch.name FROM echo_channels ch
     LEFT JOIN echo_category_permission_overrides cat_ov
       ON cat_ov.server_id = ch.server_id AND cat_ov.category_id = ch.category_id
     WHERE ch.id = $1 AND ch.server_id = $2 AND ch.type = 'voice'
       AND ch.permission_overrides->'VIEW_CHANNEL' IS DISTINCT FROM 'false'::jsonb
       AND cat_ov.permission_overrides->'VIEW_CHANNEL' IS DISTINCT FROM 'false'::jsonb
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
    [vcId, joinCtx.serverId],
  );
  const crow = ch.rows[0];
  if (!crow) return withHighlights;
  return {
    ...withHighlights,
    voiceChannel: {
      id: String(crow.id ?? '').trim(),
      name: String(crow.name ?? 'Voice').trim() || 'Voice',
    },
  };
}
