import type pg from 'pg';
import { isPostgresUndefinedColumnError } from '../../db/pgErrors';
import { assertEchoUserHasServerMembershipSlot } from '../echoPlanEntitlements';
import { nextEchoSnowflakeId } from '../echoSnowflake';
import { insertEchoAudit } from './auditLog';
import { isUserBannedFromServer } from './access';
import { isClientIpBannedFromEchoServer } from './serverIpBans';
import {
  DEFAULT_ECHO_MEMBERS_ROLE_PERMISSIONS,
  DEFAULT_ECHO_GLOBAL_ROLE_PERMISSIONS,
  echoDirectoryExcludedNamesSql,
  MAX_ECHO_SERVER_DESCRIPTION_LEN,
  MAX_ECHO_SERVER_MEDIA_URL_LEN,
  MAX_ECHO_SERVER_NAME_LEN,
} from './constants';
import { validateEchoStoredBrandingUrl } from '../../services/storedMediaUrl';
import { normalizeEchoVanityCode } from './invites';
import { parseEchoApplicationFormFromDb } from './applicationForm';
import { invalidateEchoPermissionCacheForUser } from '../echoPermissionCache';
import { applyEchoRoleLinksAfterAssignment } from './roleLinks';
import { getMergedRolePermissions } from './permissions';
async function assignMembersRoleToMember(
  pool: pg.Pool | pg.PoolClient,
  serverId: string,
  userId: string,
): Promise<void> {
  const r = await pool.query(
    `SELECT id FROM echo_roles WHERE server_id = $1 AND name = '@members' LIMIT 1`,
    [serverId],
  );
  if (!r.rows[0]) return;
  const membersId = String(r.rows[0].id);
  const ins = await pool.query(
    `INSERT INTO echo_member_roles (server_id, user_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING role_id`,
    [serverId, userId, membersId],
  );
  if ((ins.rowCount ?? 0) > 0) {
    await applyEchoRoleLinksAfterAssignment(pool, serverId, userId, membersId);
  }
}

/** @deprecated use assignMembersRoleToMember */
const assignEveryoneRoleToMember = assignMembersRoleToMember;

async function assignDefaultJoinRolesToMember(
  pool: pg.Pool | pg.PoolClient,
  serverId: string,
  userId: string,
): Promise<void> {
  const r = await pool.query(
    `SELECT id FROM echo_roles WHERE server_id = $1 AND default_on_join = true AND name <> '@members'`,
    [serverId],
  );
  for (const row of r.rows) {
    const rid = String(row.id);
    const ins = await pool.query(
      `INSERT INTO echo_member_roles (server_id, user_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING role_id`,
      [serverId, userId, rid],
    );
    if ((ins.rowCount ?? 0) > 0) {
      await applyEchoRoleLinksAfterAssignment(pool, serverId, userId, rid);
    }
  }
}

export async function createEchoServer(
  pool: pg.Pool,
  ownerId: string,
  name: string,
  iconUrl = '',
): Promise<{ serverId: string; defaultChannelId: string }> {
  const serverId = nextEchoSnowflakeId();
  const defaultTextChannelId = nextEchoSnowflakeId();
  const textCategoryId = nextEchoSnowflakeId();
  const voiceCategoryId = nextEchoSnowflakeId();
  const defaultVoiceChannelId = nextEchoSnowflakeId();
  const roleId = nextEchoSnowflakeId();
  const client = await pool.connect();
  try {
    await client.query(`BEGIN`);
    try {
      await client.query(
        `INSERT INTO echo_servers (id, name, icon_url, owner_id) VALUES ($1, $2, $3, $4)`,
        [serverId, name.trim() || 'Server', iconUrl, ownerId],
      );
      await client.query(
        `INSERT INTO echo_server_members (server_id, user_id) VALUES ($1, $2)`,
        [serverId, ownerId],
      );
      await client.query(
        `INSERT INTO echo_categories (id, server_id, name, position) VALUES ($1, $2, $3, 0)`,
        [textCategoryId, serverId, 'Text Channels'],
      );
      await client.query(
        `INSERT INTO echo_channels (id, server_id, name, type, category_id, position) VALUES ($1, $2, $3, 'text', $4, 0)`,
        [defaultTextChannelId, serverId, 'general', textCategoryId],
      );
      await client.query(
        `INSERT INTO echo_categories (id, server_id, name, position) VALUES ($1, $2, $3, 1)`,
        [voiceCategoryId, serverId, 'Voice Channels'],
      );
      await client.query(
        `INSERT INTO echo_channels (id, server_id, name, type, category_id, position) VALUES ($1, $2, $3, 'voice', $4, 0)`,
        [defaultVoiceChannelId, serverId, 'voice', voiceCategoryId],
      );
      // Seed @members role (position 0) - assigned to all server members
      await client.query(
        `INSERT INTO echo_roles (id, server_id, name, color, position, permissions) VALUES ($1, $2, $3, $4, 0, $5::jsonb)`,
        [
          roleId,
          serverId,
          '@members',
          '#99aab5',
          JSON.stringify([...DEFAULT_ECHO_MEMBERS_ROLE_PERMISSIONS]),
        ],
      );
      // Seed @global role (position -1) - base for authenticated non-members
      const globalRoleId = nextEchoSnowflakeId();
      await client.query(
        `INSERT INTO echo_roles (id, server_id, name, color, position, permissions) VALUES ($1, $2, $3, $4, -1, $5::jsonb)`,
        [
          globalRoleId,
          serverId,
          '@global',
          '#808080',
          JSON.stringify([...DEFAULT_ECHO_GLOBAL_ROLE_PERMISSIONS]),
        ],
      );
      // Seed a single global-scope "All" role for server administration
      const allRoleId = nextEchoSnowflakeId();
      await client.query(
        `
        INSERT INTO echo_roles (
          id, server_id, name, color, position, hoist, permissions,
          rank_in_category, role_scope, sync_with_category_defaults
        ) VALUES ($1, $2, $3, $4, 1, true, $5::jsonb, 0, 'global', false)
        `,
        [
          allRoleId,
          serverId,
          'All',
          '#5865F2',
          JSON.stringify(['ADMINISTRATOR']),
        ],
      );
      await assignMembersRoleToMember(client, serverId, ownerId);
      const allRoleIns = await client.query(
        `INSERT INTO echo_member_roles (server_id, user_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING role_id`,
        [serverId, ownerId, allRoleId],
      );
      if ((allRoleIns.rowCount ?? 0) > 0) {
        await applyEchoRoleLinksAfterAssignment(
          client,
          serverId,
          ownerId,
          allRoleId,
        );
      }
      invalidateEchoPermissionCacheForUser(serverId, ownerId);
      await client.query(`COMMIT`);
    } catch (e) {
      await client.query(`ROLLBACK`);
      throw e;
    }
  } finally {
    client.release();
  }
  return { serverId, defaultChannelId: defaultTextChannelId };
}

export async function addEchoServerMember(
  pool: pg.Pool | pg.PoolClient,
  serverId: string,
  userId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO echo_server_members (server_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [serverId, userId],
  );
  await assignMembersRoleToMember(pool, serverId, userId);
  await assignDefaultJoinRolesToMember(pool, serverId, userId);
  invalidateEchoPermissionCacheForUser(serverId, userId);
}

/**
 * Guild ids the user is a member of. Used to subscribe authenticated sockets to
 * `echo:server:${id}` so `workspace_invalidated` (voice roster, etc.) reaches
 * clients who have not yet called `joinChannel` for that server this session.
 */
export async function listEchoServerIdsForUser(
  pool: pg.Pool,
  userId: string,
): Promise<string[]> {
  const uid = userId.trim();
  if (!uid) return [];
  const r = await pool.query(
    `SELECT server_id FROM echo_server_members WHERE user_id = $1`,
    [uid],
  );
  const out: string[] = [];
  for (const row of r.rows as { server_id?: unknown }[]) {
    const sid = String(row.server_id ?? '').trim();
    if (sid) out.push(sid);
  }
  return out;
}

export async function listEchoServerMembers(
  pool: pg.Pool,
  serverId: string,
): Promise<
  {
    userId: string;
    name: string;
    pfp: string;
  }[]
> {
  const r = await pool.query(
    `
    SELECT m.user_id,
           COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.username), ''), 'Unknown') AS name,
           COALESCE(u.pfp, '') AS pfp
    FROM echo_server_members m
    INNER JOIN auth_users u ON u.id = m.user_id
    WHERE m.server_id = $1
    ORDER BY LOWER(COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.username), ''), 'Unknown')) ASC, m.user_id ASC
    `,
    [serverId],
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    userId: String(row.user_id),
    name: String(row.name ?? 'Unknown'),
    pfp: String(row.pfp ?? ''),
  }));
}

type EchoDirectoryServerRow = {
  id: string;
  name: string;
  iconUrl: string;
  bannerUrl: string;
  bannerPositionY?: number;
  description: string;
  tags: string[];
  createdAt: string;
  memberCount: number;
  voiceParticipantCount: number;
  lastVoiceActivityAt?: string;
  lastChatActivityAt?: string;
  allowGlobalGuests: boolean;
};

// The directory payload is identical for every (unauthenticated) visitor and is rebuilt
// from heavy COUNT/MAX aggregations across all listed servers. Cache it briefly so a burst
// of Explore loads collapses to one query; member/voice counts being a few seconds stale is
// acceptable for a directory. Keyed by limit; the stored promise also dedupes concurrent
// fills (thundering-herd guard).
const ECHO_DIRECTORY_CACHE_TTL_MS = 20_000;
const echoDirectoryCache = new Map<
  number,
  { promise: Promise<EchoDirectoryServerRow[]>; expiresAt: number }
>();

/** Public directory rows for Explore (no auth). Only servers with `listed_in_directory`. */
export function listEchoDirectoryServers(
  pool: pg.Pool,
  opts?: { limit?: number },
): Promise<EchoDirectoryServerRow[]> {
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 200));
  const now = Date.now();
  const hit = echoDirectoryCache.get(limit);
  if (hit && hit.expiresAt > now) return hit.promise;
  const promise = computeEchoDirectoryServers(pool, limit).catch((e) => {
    // Don't cache failures: drop the entry so the next call retries against the DB.
    if (echoDirectoryCache.get(limit)?.promise === promise) {
      echoDirectoryCache.delete(limit);
    }
    throw e;
  });
  echoDirectoryCache.set(limit, {
    promise,
    expiresAt: now + ECHO_DIRECTORY_CACHE_TTL_MS,
  });
  return promise;
}

async function computeEchoDirectoryServers(
  pool: pg.Pool,
  limitArg: number,
): Promise<EchoDirectoryServerRow[]> {
  const limit = limitArg;
  const exclude = echoDirectoryExcludedNamesSql();
  const directoryActivityCtes = `
    voice_activity AS (
      SELECT vp.server_id, MAX(vp.joined_at) AS last_at
      FROM echo_voice_participants vp
      WHERE vp.server_id = ANY(SELECT id FROM srv)
      GROUP BY vp.server_id
    ),
    chat_activity AS (
      SELECT c.server_id, MAX(m.created_at) AS last_at
      FROM echo_messages m
      INNER JOIN echo_channels c ON c.id = m.channel_id
      WHERE c.server_id = ANY(SELECT id FROM srv) AND m.deleted_at IS NULL
      GROUP BY c.server_id
    )`;
  const directoryActivitySelect = `
      CASE
        WHEN srv.last_voice_activity_at IS NULL AND voice_activity.last_at IS NULL THEN NULL
        ELSE GREATEST(
          COALESCE(srv.last_voice_activity_at, '-infinity'::timestamptz),
          COALESCE(voice_activity.last_at, '-infinity'::timestamptz)
        )
      END AS last_voice_activity_at,
      chat_activity.last_at AS last_chat_activity_at`;
  const directoryActivityJoins = `
    LEFT JOIN voice_activity ON voice_activity.server_id = srv.id
    LEFT JOIN chat_activity ON chat_activity.server_id = srv.id`;
  const sqlFull = `
    WITH srv AS (
      SELECT id, name, icon_url, banner_url, banner_position_y, description, tags, created_at, allow_global_guests, last_voice_activity_at
      FROM echo_servers
      WHERE listed_in_directory = true AND ${exclude}
      ORDER BY name ASC
      LIMIT $1
    ),
    counts AS (
      SELECT m.server_id, COUNT(*)::int AS member_count
      FROM echo_server_members m
      WHERE m.server_id = ANY(SELECT id FROM srv)
      GROUP BY m.server_id
    ),
    voice_counts AS (
      SELECT vp.server_id, COUNT(*)::int AS voice_participant_count
      FROM echo_voice_participants vp
      WHERE vp.server_id = ANY(SELECT id FROM srv)
      GROUP BY vp.server_id
    ),
    ${directoryActivityCtes}
    SELECT srv.id, srv.name, srv.icon_url, srv.banner_url, srv.banner_position_y, srv.description, srv.tags, srv.created_at, srv.allow_global_guests,
      COALESCE(counts.member_count, 0) AS member_count,
      COALESCE(voice_counts.voice_participant_count, 0) AS voice_participant_count,
      ${directoryActivitySelect}
    FROM srv
    LEFT JOIN counts ON counts.server_id = srv.id
    LEFT JOIN voice_counts ON voice_counts.server_id = srv.id
    ${directoryActivityJoins}
    ORDER BY srv.name ASC
  `;
  const sqlNoDescription = `
    WITH srv AS (
      SELECT id, name, icon_url, banner_url, banner_position_y, tags, created_at, allow_global_guests, last_voice_activity_at
      FROM echo_servers
      WHERE listed_in_directory = true AND ${exclude}
      ORDER BY name ASC
      LIMIT $1
    ),
    counts AS (
      SELECT m.server_id, COUNT(*)::int AS member_count
      FROM echo_server_members m
      WHERE m.server_id = ANY(SELECT id FROM srv)
      GROUP BY m.server_id
    ),
    voice_counts AS (
      SELECT vp.server_id, COUNT(*)::int AS voice_participant_count
      FROM echo_voice_participants vp
      WHERE vp.server_id = ANY(SELECT id FROM srv)
      GROUP BY vp.server_id
    ),
    ${directoryActivityCtes}
    SELECT srv.id, srv.name, srv.icon_url, srv.banner_url, srv.banner_position_y, srv.tags, srv.created_at, srv.allow_global_guests,
      COALESCE(counts.member_count, 0) AS member_count,
      COALESCE(voice_counts.voice_participant_count, 0) AS voice_participant_count,
      ${directoryActivitySelect}
    FROM srv
    LEFT JOIN counts ON counts.server_id = srv.id
    LEFT JOIN voice_counts ON voice_counts.server_id = srv.id
    ${directoryActivityJoins}
    ORDER BY srv.name ASC
  `;

  const directoryActivitySelectLiveOnly = `
      voice_activity.last_at AS last_voice_activity_at,
      chat_activity.last_at AS last_chat_activity_at`;
  const sqlNoDescriptionLegacy = `
    WITH srv AS (
      SELECT id, name, icon_url, banner_url, banner_position_y, tags, created_at, allow_global_guests
      FROM echo_servers
      WHERE listed_in_directory = true AND ${exclude}
      ORDER BY name ASC
      LIMIT $1
    ),
    counts AS (
      SELECT m.server_id, COUNT(*)::int AS member_count
      FROM echo_server_members m
      WHERE m.server_id = ANY(SELECT id FROM srv)
      GROUP BY m.server_id
    ),
    voice_counts AS (
      SELECT vp.server_id, COUNT(*)::int AS voice_participant_count
      FROM echo_voice_participants vp
      WHERE vp.server_id = ANY(SELECT id FROM srv)
      GROUP BY vp.server_id
    ),
    ${directoryActivityCtes}
    SELECT srv.id, srv.name, srv.icon_url, srv.banner_url, srv.banner_position_y, srv.tags, srv.created_at, srv.allow_global_guests,
      COALESCE(counts.member_count, 0) AS member_count,
      COALESCE(voice_counts.voice_participant_count, 0) AS voice_participant_count,
      ${directoryActivitySelectLiveOnly}
    FROM srv
    LEFT JOIN counts ON counts.server_id = srv.id
    LEFT JOIN voice_counts ON voice_counts.server_id = srv.id
    ${directoryActivityJoins}
    ORDER BY srv.name ASC
  `;

  let r: pg.QueryResult<Record<string, unknown>>;
  try {
    r = await pool.query(sqlFull, [limit]);
  } catch (e) {
    const msg = String((e as Error).message);
    if (!isPostgresUndefinedColumnError(e)) throw e;
    if (/\bdescription\b/i.test(msg)) {
      try {
        r = await pool.query(sqlNoDescription, [limit]);
      } catch (e2) {
        if (
          !isPostgresUndefinedColumnError(e2) ||
          !/\blast_voice_activity_at\b/i.test(String((e2 as Error).message))
        )
          throw e2;
        r = await pool.query(sqlNoDescriptionLegacy, [limit]);
      }
    } else if (/\blast_voice_activity_at\b/i.test(msg)) {
      r = await pool.query(
        sqlFull
          .replace(/,\s*last_voice_activity_at/g, '')
          .replace(directoryActivitySelect, directoryActivitySelectLiveOnly),
        [limit],
      );
    } else {
      throw e;
    }
  }

  return r.rows.map((row) => {
    const createdRaw = row.created_at;
    let createdAt = '';
    if (createdRaw instanceof Date) {
      createdAt = createdRaw.toISOString();
    } else if (createdRaw != null) {
      createdAt = String(createdRaw);
    }
    const mc = row.member_count;
    const memberCount =
      typeof mc === 'number' && Number.isFinite(mc)
        ? mc
        : typeof mc === 'string'
          ? parseInt(mc, 10) || 0
          : Number(mc) || 0;
    const vpc = row.voice_participant_count;
    const voiceParticipantCount =
      typeof vpc === 'number' && Number.isFinite(vpc)
        ? Math.max(0, Math.floor(vpc))
        : typeof vpc === 'string'
          ? Math.max(0, parseInt(vpc, 10) || 0)
          : Math.max(0, Number(vpc) || 0);
    const rawTags = Array.isArray(row.tags) ? row.tags : [];
    const tags = rawTags
      .filter((tag): tag is string => typeof tag === 'string')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const lastVoiceActivityAt = isoFromDirectoryActivityAt(
      row.last_voice_activity_at,
    );
    const lastChatActivityAt = isoFromDirectoryActivityAt(
      row.last_chat_activity_at,
    );
    return {
      id: String(row.id),
      name: String(row.name),
      iconUrl: String(row.icon_url ?? ''),
      bannerUrl: String(row.banner_url ?? ''),
      bannerPositionY:
        row.banner_position_y != null &&
        Number.isFinite(Number(row.banner_position_y))
          ? Math.max(0, Math.min(100, Number(row.banner_position_y)))
          : 50,
      description:
        'description' in row && row.description != null
          ? String(row.description).trim()
          : '',
      tags,
      createdAt,
      memberCount,
      voiceParticipantCount,
      ...(lastVoiceActivityAt ? { lastVoiceActivityAt } : {}),
      ...(lastChatActivityAt ? { lastChatActivityAt } : {}),
      allowGlobalGuests: Boolean(row.allow_global_guests),
    };
  });
}

function isoFromDirectoryActivityAt(raw: unknown): string {
  if (raw == null) return '';
  if (raw instanceof Date) return raw.toISOString();
  const s = String(raw).trim();
  if (!s || s === '-infinity' || s === 'infinity') return '';
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}

/** Directory-listed server ids ordered by member count (desc) for guest auto-join sampling. */
export async function listTopDirectoryServerIdsByMemberCount(
  pool: pg.Pool,
  take: number,
  opts?: { guestEligibleOnly?: boolean },
): Promise<string[]> {
  const limit = Math.min(50, Math.max(1, take));
  const exclude = echoDirectoryExcludedNamesSql();
  const guestOnly = opts?.guestEligibleOnly
    ? 'AND s.allow_global_guests = true'
    : '';
  const sql = `
    SELECT s.id::text AS id, s.member_count AS mc
    FROM echo_servers s
    WHERE s.listed_in_directory = true AND ${exclude} ${guestOnly}
    ORDER BY mc DESC, id ASC
    LIMIT $1
  `;
  const r = await pool.query(sql, [limit]);
  return (r.rows ?? []).map((row: { id: unknown }) => String(row.id));
}

export function sampleDistinctServerIds(
  ids: string[],
  pick: number,
  rng: () => number = Math.random,
): string[] {
  const copy = [...ids];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = a;
  }
  return copy.slice(0, Math.min(pick, copy.length));
}

export async function listEchoServersForUser(
  pool: pg.Pool,
  userId: string,
): Promise<
  {
    id: string;
    name: string;
    iconUrl: string;
    bannerUrl: string;
    bannerPositionY?: number;
    ownerId: string;
    description: string;
    tags?: string[];
    listedInDirectory?: boolean;
    inviteJoinEnabled?: boolean;
    automodSpamEnabled?: boolean;
    bannerBlurEnabled?: boolean;
    bannerBlackoutEnabled?: boolean;
    raidProtectionEnabled?: boolean;
    raidJoinThresholdCount?: number;
    raidJoinWindowSeconds?: number;
    applicationsEnabled?: boolean;
    discordGuildId?: string;
    allowGlobalGuests?: boolean;
    verificationRequireEmail?: boolean;
  }[]
> {
  const r = await pool.query(
    `
    SELECT s.id, s.name, s.icon_url, s.banner_url, s.banner_position_y, s.owner_id, s.listed_in_directory, s.invite_join_enabled, s.banner_blur_enabled, s.banner_blackout_enabled,
           s.automod_spam_enabled, s.raid_protection_enabled, s.raid_join_threshold_count, s.raid_join_window_seconds,
           s.vanity_code, s.description, s.tags, s.applications_enabled, s.allow_global_guests, s.verification_require_email, ist.discord_guild_id
    FROM echo_servers s
    INNER JOIN echo_server_members m ON m.server_id = s.id AND m.user_id = $1
    LEFT JOIN echo_discord_import_states ist ON ist.server_id = s.id
    ORDER BY s.name ASC
    `,
    [userId],
  );
  return r.rows.map((row: any) => ({
    id: String(row.id),
    name: String(row.name),
    iconUrl: String(row.icon_url ?? ''),
    bannerUrl: String(row.banner_url ?? ''),
    bannerPositionY:
      row.banner_position_y != null &&
      Number.isFinite(Number(row.banner_position_y))
        ? Math.max(0, Math.min(100, Number(row.banner_position_y)))
        : 50,
    ownerId: String(row.owner_id),
    description: String(row.description ?? '').trim(),
    listedInDirectory:
      row.listed_in_directory === null
        ? undefined
        : Boolean(row.listed_in_directory),
    inviteJoinEnabled:
      row.invite_join_enabled === null
        ? undefined
        : Boolean(row.invite_join_enabled),
    tags: Array.isArray(row.tags)
      ? row.tags
          .filter((tag: unknown): tag is string => typeof tag === 'string')
          .map((tag: string) => tag.trim())
          .filter(Boolean)
      : undefined,
    vanityCode: String(row.vanity_code ?? '').trim() || undefined,
    automodSpamEnabled:
      row.automod_spam_enabled === null
        ? undefined
        : Boolean(row.automod_spam_enabled),
    bannerBlurEnabled:
      row.banner_blur_enabled === null
        ? undefined
        : Boolean(row.banner_blur_enabled),
    bannerBlackoutEnabled:
      row.banner_blackout_enabled === null
        ? undefined
        : Boolean(row.banner_blackout_enabled),
    raidProtectionEnabled:
      row.raid_protection_enabled === null
        ? undefined
        : Boolean(row.raid_protection_enabled),
    raidJoinThresholdCount:
      row.raid_join_threshold_count == null
        ? undefined
        : Math.max(2, Number(row.raid_join_threshold_count) || 10),
    raidJoinWindowSeconds:
      row.raid_join_window_seconds == null
        ? undefined
        : Math.max(10, Number(row.raid_join_window_seconds) || 60),
    applicationsEnabled:
      row.applications_enabled === null
        ? undefined
        : Boolean(row.applications_enabled),
    allowGlobalGuests:
      row.allow_global_guests === null
        ? undefined
        : Boolean(row.allow_global_guests),
    verificationRequireEmail:
      row.verification_require_email === null
        ? undefined
        : Boolean(row.verification_require_email),
    discordGuildId:
      row.discord_guild_id != null
        ? String(row.discord_guild_id).trim()
        : undefined,
  }));
}

export type UpdateEchoServerPreferencesResult =
  | 'ok'
  | 'forbidden'
  | 'not_found'
  | 'invalid_body'
  | 'vanity_taken';

/** Update persisted server-level UI preferences and branding (requires owner or MANAGE_GUILD / Legacy “Manage Server”). */
export async function updateEchoServerPreferences(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  body: {
    /** Display name (trimmed, 1–100 chars). */
    name?: string;
    automodSpamEnabled?: boolean;
    bannerBlurEnabled?: boolean;
    bannerBlackoutEnabled?: boolean;
    iconUrl?: string;
    bannerUrl?: string;
    /** Vertical crop anchor for server banner cover image (0–100). */
    bannerPositionY?: number;
    /** When false, server is hidden from GET /directory/servers (Explore). */
    listedInDirectory?: boolean;
    /** When false, token/vanity invites cannot admit new members. */
    inviteJoinEnabled?: boolean;
    /** Lowercase slug (3–32 chars, `a-z0-9` and single hyphens between segments). Empty string clears. */
    vanityCode?: string;
    /** Short public blurb for Explore directory (max 400 chars). */
    description?: string;
    /** Public Explore tags; normalized to lowercase unique tokens. */
    tags?: string[];
    /** Burst join protection toggle. */
    raidProtectionEnabled?: boolean;
    /** Max joins allowed inside raid window before new joins are blocked. */
    raidJoinThresholdCount?: number;
    /** Sliding join window used by raid protection (seconds). */
    raidJoinWindowSeconds?: number;
    /** When false, guest sessions cannot join from Explore or invite flows. */
    allowGlobalGuests?: boolean;
    /** When true, newly joining accounts must have a verified email. */
    verificationRequireEmail?: boolean;
    applicationsEnabled?: boolean;
    applicationForm?: unknown;
  },
): Promise<UpdateEchoServerPreferencesResult> {
  const MAX_SERVER_TAGS = 8;
  const MAX_SERVER_TAG_LEN = 32;
  function normalizeServerTags(raw: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const tag of raw) {
      const normalized = tag.trim().toLowerCase().slice(0, MAX_SERVER_TAG_LEN);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
      if (out.length >= MAX_SERVER_TAGS) break;
    }
    return out;
  }
  const srvQ = await pool.query(
    `SELECT owner_id FROM echo_servers WHERE id = $1 LIMIT 1`,
    [serverId],
  );
  if (!srvQ.rows[0]) return 'not_found';
  const ownerId = String(srvQ.rows[0].owner_id);
  // allow owner
  if (ownerId !== actorId) {
    const perms = await getMergedRolePermissions(pool, serverId, actorId);
    if (!perms.has('MANAGE_GUILD')) return 'forbidden';
  }
  const updates: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') return 'invalid_body';
    const trimmed = body.name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_ECHO_SERVER_NAME_LEN)
      return 'invalid_body';
    updates.push(`name = $${idx++}`);
    params.push(trimmed);
  }
  if (body.bannerBlurEnabled !== undefined) {
    updates.push(`banner_blur_enabled = $${idx++}`);
    params.push(body.bannerBlurEnabled);
  }
  if (body.automodSpamEnabled !== undefined) {
    updates.push(`automod_spam_enabled = $${idx++}`);
    params.push(body.automodSpamEnabled);
  }
  if (body.bannerBlackoutEnabled !== undefined) {
    updates.push(`banner_blackout_enabled = $${idx++}`);
    params.push(body.bannerBlackoutEnabled);
  }
  if (body.iconUrl !== undefined) {
    if (
      typeof body.iconUrl !== 'string' ||
      body.iconUrl.length > MAX_ECHO_SERVER_MEDIA_URL_LEN
    ) {
      return 'invalid_body';
    }
    const trimmed = body.iconUrl.trim();
    if (trimmed.length > 0) {
      const v = validateEchoStoredBrandingUrl(trimmed);
      if (!v.ok) return 'invalid_body';
      updates.push(`icon_url = $${idx++}`);
      params.push(v.value);
    } else {
      updates.push(`icon_url = $${idx++}`);
      params.push('');
    }
  }
  if (body.bannerUrl !== undefined) {
    if (
      typeof body.bannerUrl !== 'string' ||
      body.bannerUrl.length > MAX_ECHO_SERVER_MEDIA_URL_LEN
    ) {
      return 'invalid_body';
    }
    const trimmed = body.bannerUrl.trim();
    if (trimmed.length > 0) {
      const v = validateEchoStoredBrandingUrl(trimmed);
      if (!v.ok) return 'invalid_body';
      updates.push(`banner_url = $${idx++}`);
      params.push(v.value);
    } else {
      updates.push(`banner_url = $${idx++}`);
      params.push('');
    }
  }
  if (body.bannerPositionY !== undefined) {
    if (
      typeof body.bannerPositionY !== 'number' ||
      !Number.isFinite(body.bannerPositionY) ||
      body.bannerPositionY < 0 ||
      body.bannerPositionY > 100
    ) {
      return 'invalid_body';
    }
    updates.push(`banner_position_y = $${idx++}`);
    params.push(body.bannerPositionY);
  }
  if (body.listedInDirectory !== undefined) {
    if (typeof body.listedInDirectory !== 'boolean') return 'invalid_body';
    updates.push(`listed_in_directory = $${idx++}`);
    params.push(body.listedInDirectory);
  }
  if (body.inviteJoinEnabled !== undefined) {
    if (typeof body.inviteJoinEnabled !== 'boolean') return 'invalid_body';
    updates.push(`invite_join_enabled = $${idx++}`);
    params.push(body.inviteJoinEnabled);
  }
  if (body.vanityCode !== undefined) {
    if (typeof body.vanityCode !== 'string') return 'invalid_body';
    const normalized = normalizeEchoVanityCode(body.vanityCode);
    if (normalized === null) return 'invalid_body';
    if (normalized !== '') {
      const clash = await pool.query(
        `SELECT 1 FROM echo_servers WHERE id <> $1 AND LOWER(vanity_code) = $2 AND vanity_code <> '' LIMIT 1`,
        [serverId, normalized],
      );
      if (clash.rows.length > 0) return 'vanity_taken';
    }
    updates.push(`vanity_code = $${idx++}`);
    params.push(normalized);
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') return 'invalid_body';
    const trimmed = body.description.trim();
    if (trimmed.length > MAX_ECHO_SERVER_DESCRIPTION_LEN) return 'invalid_body';
    updates.push(`description = $${idx++}`);
    params.push(trimmed);
  }
  if (body.tags !== undefined) {
    if (
      !Array.isArray(body.tags) ||
      body.tags.some((tag) => typeof tag !== 'string')
    ) {
      return 'invalid_body';
    }
    const normalized = normalizeServerTags(body.tags);
    updates.push(`tags = $${idx++}::jsonb`);
    params.push(JSON.stringify(normalized));
  }
  if (body.raidProtectionEnabled !== undefined) {
    if (typeof body.raidProtectionEnabled !== 'boolean') return 'invalid_body';
    updates.push(`raid_protection_enabled = $${idx++}`);
    params.push(body.raidProtectionEnabled);
  }
  if (body.raidJoinThresholdCount !== undefined) {
    if (
      typeof body.raidJoinThresholdCount !== 'number' ||
      !Number.isFinite(body.raidJoinThresholdCount)
    ) {
      return 'invalid_body';
    }
    const n = Math.floor(body.raidJoinThresholdCount);
    if (n < 2 || n > 100) return 'invalid_body';
    updates.push(`raid_join_threshold_count = $${idx++}`);
    params.push(n);
  }
  if (body.raidJoinWindowSeconds !== undefined) {
    if (
      typeof body.raidJoinWindowSeconds !== 'number' ||
      !Number.isFinite(body.raidJoinWindowSeconds)
    ) {
      return 'invalid_body';
    }
    const n = Math.floor(body.raidJoinWindowSeconds);
    if (n < 10 || n > 3600) return 'invalid_body';
    updates.push(`raid_join_window_seconds = $${idx++}`);
    params.push(n);
  }
  if (body.allowGlobalGuests !== undefined) {
    if (typeof body.allowGlobalGuests !== 'boolean') return 'invalid_body';
    updates.push(`allow_global_guests = $${idx++}`);
    params.push(body.allowGlobalGuests);
  }
  if (body.verificationRequireEmail !== undefined) {
    if (typeof body.verificationRequireEmail !== 'boolean')
      return 'invalid_body';
    updates.push(`verification_require_email = $${idx++}`);
    params.push(body.verificationRequireEmail);
  }
  if (body.applicationsEnabled !== undefined) {
    if (typeof body.applicationsEnabled !== 'boolean') return 'invalid_body';
    updates.push(`applications_enabled = $${idx++}`);
    params.push(body.applicationsEnabled);
  }
  if (body.applicationForm !== undefined) {
    const parsed = parseEchoApplicationFormFromDb(body.applicationForm);
    if (!parsed) return 'invalid_body';
    updates.push(`application_form = $${idx++}::jsonb`);
    params.push(JSON.stringify(parsed));
  }
  if (updates.length === 0) return 'invalid_body';
  params.push(serverId);
  await pool.query(
    `UPDATE echo_servers SET ${updates.join(', ')} WHERE id = $${idx}`,
    params,
  );
  return 'ok';
}

export async function isEchoRaidJoinBlocked(
  pool: pg.Pool | pg.PoolClient,
  serverId: string,
): Promise<{
  blocked: boolean;
  joinsInWindow: number;
  threshold: number;
  windowSeconds: number;
}> {
  const cfg = await pool.query(
    `
    SELECT raid_protection_enabled, raid_join_threshold_count, raid_join_window_seconds
    FROM echo_servers
    WHERE id = $1
    LIMIT 1
    `,
    [serverId],
  );
  const row = cfg.rows[0];
  const enabled = row ? Boolean(row.raid_protection_enabled) : true;
  const threshold = row
    ? Math.max(2, Number(row.raid_join_threshold_count) || 10)
    : 10;
  const windowSeconds = row
    ? Math.max(10, Number(row.raid_join_window_seconds) || 60)
    : 60;
  if (!enabled) {
    return {
      blocked: false,
      joinsInWindow: 0,
      threshold,
      windowSeconds,
    };
  }
  const countQ = await pool.query(
    `
    SELECT COUNT(*)::int AS joins
    FROM echo_server_members
    WHERE server_id = $1
      AND joined_at >= NOW() - ($2::int * interval '1 second')
    `,
    [serverId, windowSeconds],
  );
  const joinsInWindow = Math.max(0, Number(countQ.rows[0]?.joins) || 0);
  return {
    blocked: joinsInWindow >= threshold,
    joinsInWindow,
    threshold,
    windowSeconds,
  };
}

export type EchoVanityAvailabilityStatus =
  | 'available'
  | 'taken'
  | 'invalid'
  | 'current';

export type CheckEchoVanityAvailabilityResult =
  | EchoVanityAvailabilityStatus
  | 'forbidden'
  | 'not_found';

/** Read-only vanity slug check for server settings UI (owner or MANAGE_GUILD). */
export async function checkEchoVanityAvailability(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  rawCode: string,
): Promise<CheckEchoVanityAvailabilityResult> {
  const srvQ = await pool.query(
    `SELECT owner_id, vanity_code FROM echo_servers WHERE id = $1 LIMIT 1`,
    [serverId],
  );
  if (!srvQ.rows[0]) return 'not_found';
  const ownerId = String(srvQ.rows[0].owner_id);
  if (ownerId !== actorId) {
    const perms = await getMergedRolePermissions(pool, serverId, actorId);
    if (!perms.has('MANAGE_GUILD')) return 'forbidden';
  }
  const normalized = normalizeEchoVanityCode(
    typeof rawCode === 'string' ? rawCode : '',
  );
  if (normalized === null) return 'invalid';
  const current = String(srvQ.rows[0].vanity_code ?? '')
    .trim()
    .toLowerCase();
  if (normalized === '') return 'available';
  if (current === normalized) return 'current';
  const clash = await pool.query(
    `SELECT 1 FROM echo_servers WHERE id <> $1 AND LOWER(vanity_code) = $2 AND vanity_code <> '' LIMIT 1`,
    [serverId, normalized],
  );
  return clash.rows.length > 0 ? 'taken' : 'available';
}

export async function getEchoServerVanityCode(
  pool: pg.Pool,
  serverId: string,
): Promise<string> {
  const q = await pool.query(
    `SELECT vanity_code FROM echo_servers WHERE id = $1 LIMIT 1`,
    [serverId],
  );
  return q.rows[0] ? String(q.rows[0].vanity_code ?? '').trim() : '';
}

export type JoinEchoDirectoryResult =
  | {
      ok: true;
      serverId: string;
      alreadyMember: boolean;
      joinAuditId: string | null;
    }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'not_listed'
        | 'banned'
        | 'server_limit'
        | 'raid_protection'
        | 'guest_join_forbidden'
        | 'email_verification_required';
    };

export type JoinEchoInviteResult =
  | {
      ok: true;
      serverId: string;
      alreadyMember: boolean;
      joinAuditId: string | null;
    }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'banned'
        | 'server_limit'
        | 'raid_protection'
        | 'invites_disabled'
        | 'guest_join_forbidden'
        | 'email_verification_required';
    };

/**
 * Join a server via invite flow with atomic raid checks under row lock to avoid
 * concurrent burst-join races.
 */
export async function joinEchoServerFromInvite(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  joinClientIp: string | null = null,
  opts?: { skipInviteJoinGate?: boolean; isGuest?: boolean },
): Promise<JoinEchoInviteResult> {
  if (await isUserBannedFromServer(pool, serverId, userId)) {
    return { ok: false, reason: 'banned' };
  }
  if (await isClientIpBannedFromEchoServer(pool, serverId, joinClientIp)) {
    return { ok: false, reason: 'banned' };
  }
  const client = await pool.connect();
  let alreadyMember = false;
  try {
    await client.query(`BEGIN`);
    try {
      const locked = await client.query(
        `SELECT invite_join_enabled, allow_global_guests, verification_require_email FROM echo_servers WHERE id = $1 FOR UPDATE`,
        [serverId],
      );
      if (!locked.rows[0]) {
        await client.query(`ROLLBACK`);
        return { ok: false, reason: 'not_found' };
      }
      const allowGlobalGuests = Boolean(locked.rows[0].allow_global_guests);
      if (opts?.isGuest && !allowGlobalGuests) {
        await client.query(`ROLLBACK`);
        return { ok: false, reason: 'guest_join_forbidden' };
      }
      const requireVerifiedEmail = Boolean(
        locked.rows[0].verification_require_email,
      );
      const inviteJoinEnabled = locked.rows[0].invite_join_enabled !== false;
      const mem = await client.query(
        `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
        [serverId, userId],
      );
      alreadyMember = mem.rows.length > 0;
      if (!alreadyMember && requireVerifiedEmail) {
        const verified = await client.query(
          `SELECT email_verified_at FROM auth_users WHERE id = $1 LIMIT 1`,
          [userId],
        );
        if (!verified.rows[0]?.email_verified_at) {
          await client.query(`ROLLBACK`);
          return { ok: false, reason: 'email_verification_required' };
        }
      }
      if (!alreadyMember && !inviteJoinEnabled && !opts?.skipInviteJoinGate) {
        await client.query(`ROLLBACK`);
        return { ok: false, reason: 'invites_disabled' };
      }
      if (!alreadyMember) {
        const raid = await isEchoRaidJoinBlocked(client, serverId);
        if (raid.blocked) {
          await client.query(`ROLLBACK`);
          return { ok: false, reason: 'raid_protection' };
        }
        const slot = await assertEchoUserHasServerMembershipSlot(
          client,
          userId,
        );
        if (!slot.ok) {
          await client.query(`ROLLBACK`);
          return { ok: false, reason: 'server_limit' };
        }
      }
      await addEchoServerMember(client, serverId, userId);
      await client.query(`COMMIT`);
    } catch (e) {
      await client.query(`ROLLBACK`);
      throw e;
    }
  } finally {
    client.release();
  }
  let joinAuditId: string | null = null;
  if (!alreadyMember) {
    joinAuditId = await insertEchoAudit(
      pool,
      serverId,
      userId,
      'member.join',
      'user',
      userId,
      { source: 'invite' },
    );
  }
  return { ok: true, serverId, alreadyMember, joinAuditId };
}

/** Join a server that is listed in the public Explore directory (same gate as directory listing). */
export async function joinEchoServerFromDirectory(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  joinClientIp: string | null = null,
  opts?: { isGuest?: boolean },
): Promise<JoinEchoDirectoryResult> {
  const exclude = echoDirectoryExcludedNamesSql();
  const listed = await pool.query(
    `SELECT id, allow_global_guests, verification_require_email FROM echo_servers WHERE id = $1 AND listed_in_directory = true AND ${exclude} LIMIT 1`,
    [serverId],
  );
  if (!listed.rows[0]) {
    const exists = await pool.query(
      `SELECT 1 FROM echo_servers WHERE id = $1 LIMIT 1`,
      [serverId],
    );
    return exists.rows[0]
      ? { ok: false, reason: 'not_listed' }
      : { ok: false, reason: 'not_found' };
  }
  const allowGlobalGuests = Boolean(listed.rows[0].allow_global_guests);
  if (opts?.isGuest && !allowGlobalGuests) {
    return { ok: false, reason: 'guest_join_forbidden' };
  }
  const requireVerifiedEmail = Boolean(
    listed.rows[0].verification_require_email,
  );
  if (requireVerifiedEmail) {
    const verified = await pool.query(
      `SELECT email_verified_at FROM auth_users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    if (!verified.rows[0]?.email_verified_at) {
      return { ok: false, reason: 'email_verification_required' };
    }
  }
  if (await isUserBannedFromServer(pool, serverId, userId)) {
    return { ok: false, reason: 'banned' };
  }
  if (await isClientIpBannedFromEchoServer(pool, serverId, joinClientIp)) {
    return { ok: false, reason: 'banned' };
  }
  const client = await pool.connect();
  let alreadyMember = false;
  try {
    await client.query(`BEGIN`);
    try {
      await client.query(
        `SELECT 1 FROM echo_servers WHERE id = $1 FOR UPDATE`,
        [serverId],
      );
      const mem = await client.query(
        `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
        [serverId, userId],
      );
      alreadyMember = mem.rows.length > 0;
      if (!alreadyMember) {
        const raid = await isEchoRaidJoinBlocked(client, serverId);
        if (raid.blocked) {
          await client.query(`ROLLBACK`);
          return { ok: false, reason: 'raid_protection' };
        }
        const slot = await assertEchoUserHasServerMembershipSlot(
          client,
          userId,
        );
        if (!slot.ok) {
          await client.query(`ROLLBACK`);
          return { ok: false, reason: 'server_limit' };
        }
      }
      await addEchoServerMember(client, serverId, userId);
      await client.query(`COMMIT`);
    } catch (e) {
      await client.query(`ROLLBACK`);
      throw e;
    }
  } finally {
    client.release();
  }
  let joinAuditId: string | null = null;
  if (!alreadyMember) {
    joinAuditId = await insertEchoAudit(
      pool,
      serverId,
      userId,
      'member.join',
      'user',
      userId,
      {
        source: 'directory',
      },
    );
  }
  return { ok: true, serverId, alreadyMember, joinAuditId };
}
