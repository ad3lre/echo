import type pg from 'pg';
import { publicBadgesFromSignupOrdinal } from '../../../../shared/echoAccountBadges';
import { config } from '../../config';
import {
  liveKitRoomName,
  listLiveKitParticipants,
} from '../../services/livekit/livekitAdapter';
import { vcTrace } from '../../observability/voiceTraceLog';
import { resolveDiscordAvatarForStorage } from '../discordNormalized';
import { echoPartialToChannelOverrides } from '../../../../shared/rolePermissionBridge';
import { executeEvaluationPlan } from '../echoPermissionEvaluate';
import { invalidateEchoPermissionCacheForServer } from '../echoPermissionCache';
import { clampEchoChannelName } from '../../../../shared/echoChannelLimits';
import { nextEchoSnowflakeId } from '../echoSnowflake';
import {
  mergeOverwritesForMember,
  type DbOverwriteRow,
} from '../permissionOverwriteMerge';
import { getEchoWorkspaceVersionForServers } from './auditLog';
import {
  loadEchoWorkspaceEventPayload,
  type EchoWorkspaceEventSummary,
  type EchoWorkspaceMyEventRsvp,
} from './serverEvents';
import {
  batchGetEffectiveChannelPermissions,
  getMergedRolePermissions,
} from './permissions';
import { listEchoServersForUser } from './servers';
import {
  applyForumCreatorManageChannelBoost,
  forumCreatorCanDeleteOwnPost,
  getForumPostCreatorAccess,
} from './forumCreatorAccess';
import { parseAutoDeleteAfterSecondsPatch } from './messageAutoDelete';

export async function listEchoChannels(
  pool: pg.Pool,
  serverId: string,
): Promise<
  {
    id: string;
    name: string;
    type: string;
    categoryId: string;
    categoryName: string;
    categoryPosition: number;
    position: number;
    permissionOverrides: unknown;
    slowmodeSeconds: number;
    userLimit: number;
    bitrateBps: number | null;
    voiceE2eeEnabled: boolean;
    nsfw: boolean;
    iconKey: string;
    messageHistoryAnchor: 'top' | 'bottom';
    autoDeleteAfterSeconds: number | null;
    autoDeleteSyncedToCategory: boolean;
    discordVoiceMirrorOnly?: boolean;
    discordChannelId?: string;
  }[]
> {
  const r = await pool.query(
    `
    SELECT ch.id, ch.name, ch.type, ch.position, ch.permission_overrides,
           ch.slowmode_seconds, ch.user_limit, ch.bitrate_bps, ch.voice_e2ee_enabled, ch.nsfw, ch.icon_key,
           ch.message_history_anchor,
           ch.auto_delete_after_seconds, ch.auto_delete_synced_to_category,
           ch.discord_voice_mirror_only,
           ch.message_format_template, ch.message_format_hard,
           ch.parent_channel_id, ch.forum_available_tags, ch.forum_post_tag_ids,
           ch.forum_post_pinned, ch.forum_post_locked, ch.forum_post_archived_at,
           ch.forum_post_creator_user_id, ch.forum_creator_default_perms,
           cat.id AS category_id, cat.name AS category_name, cat.position AS category_position,
           cat.auto_delete_after_seconds AS category_auto_delete_after_seconds,
           ow.partial AS everyone_channel_partial,
           COALESCE(
             NULLIF(BTRIM(mi.discord_channel_id::text), ''),
             dmap.discord_from_import_map
           ) AS discord_channel_id
    FROM echo_channels ch
    LEFT JOIN echo_categories cat ON cat.id = ch.category_id AND cat.server_id = ch.server_id
    LEFT JOIN echo_channel_permission_overwrite_rows ow
      ON ow.channel_id = ch.id AND ow.server_id = ch.server_id AND ow.target_type = 'everyone'
    LEFT JOIN echo_discord_channel_message_imports mi ON mi.channel_id = ch.id
    LEFT JOIN LATERAL (
      SELECT kv.key AS discord_from_import_map
      FROM echo_discord_import_states ist
      CROSS JOIN LATERAL jsonb_each_text(ist.channel_id_map) AS kv(key, value)
      WHERE ist.server_id = ch.server_id
        AND ist.channels_imported_at IS NOT NULL
        AND kv.value = ch.id
      LIMIT 1
    ) dmap ON true
    WHERE ch.server_id = $1
    ORDER BY (ch.category_id IS NULL) ASC, cat.position ASC NULLS LAST, ch.position ASC, ch.name ASC
    `,
    [serverId],
  );
  return r.rows.map((row: any) => mapWorkspaceChannelQueryRow(row));
}

/**
 * Same rows as {@link listEchoChannels}, but only channels the member may
 * `VIEW_CHANNEL` (matches workspace bootstrap / message list access).
 */
export async function listEchoChannelsForUser(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<Awaited<ReturnType<typeof listEchoChannels>>> {
  const all = await listEchoChannels(pool, serverId);
  const ids = all.map((c) => c.id);
  if (ids.length === 0) return [];
  let permsMap: Map<string, Set<string>>;
  try {
    permsMap = await batchGetEffectiveChannelPermissions(
      pool,
      serverId,
      userId,
      ids,
    );
  } catch {
    return [];
  }
  return all.filter((ch) => permsMap.get(ch.id)?.has('VIEW_CHANNEL'));
}

export async function listEchoCategories(
  pool: pg.Pool,
  serverId: string,
): Promise<
  {
    id: string;
    name: string;
    position: number;
    autoDeleteAfterSeconds: number | null;
  }[]
> {
  const r = await pool.query(
    `SELECT id, name, position, auto_delete_after_seconds
     FROM echo_categories WHERE server_id = $1 ORDER BY position ASC, name ASC`,
    [serverId],
  );
  return r.rows.map((row: any) => ({
    id: String(row.id),
    name: String(row.name),
    position: Number(row.position ?? 0),
    autoDeleteAfterSeconds:
      row.auto_delete_after_seconds != null
        ? Number(row.auto_delete_after_seconds)
        : null,
  }));
}

export type EchoWorkspaceCategoryBootstrap = {
  id: string;
  name: string;
  channels: unknown[];
  channelPermissionDefaults: Record<string, never>;
  autoDeleteAfterSeconds?: number | null;
  /** When true, channel list UI omits the category header (compact uncategorized / root channels). */
  hideCategoryHeader?: boolean;
};

type EchoChannelRowInternal = {
  id: string;
  name: string;
  type: string;
  parentChannelId?: string;
  categoryId: string;
  categoryName: string;
  categoryPosition: number;
  position: number;
  permissionOverrides: unknown;
  slowmodeSeconds: number;
  userLimit: number;
  bitrateBps: number | null;
  voiceE2eeEnabled: boolean;
  nsfw: boolean;
  iconKey: string;
  messageHistoryAnchor: 'top' | 'bottom';
  autoDeleteAfterSeconds: number | null;
  autoDeleteSyncedToCategory: boolean;
  categoryAutoDeleteAfterSeconds: number | null;
  discordVoiceMirrorOnly: boolean;
  discordChannelId?: string;
  messageFormatTemplate: string;
  messageFormatHard: boolean;
  forumAvailableTags?: unknown;
  forumPostTagIds?: unknown;
  forumPostPinned?: boolean;
  forumPostLocked?: boolean;
  forumPostArchivedAt?: Date | null;
  forumPostCreatorUserId?: string;
  forumCreatorDefaultPerms?: unknown;
};

function mapWorkspaceChannelQueryRow(row: any): EchoChannelRowInternal {
  const catId =
    row.category_id != null && String(row.category_id).trim()
      ? String(row.category_id)
      : '';
  return {
    id: String(row.id),
    name: String(row.name),
    type: String(row.type),
    parentChannelId:
      row.parent_channel_id != null && String(row.parent_channel_id).trim()
        ? String(row.parent_channel_id)
        : undefined,
    categoryId: catId,
    categoryName: catId ? String(row.category_name ?? '') : '',
    categoryPosition: catId
      ? Number(row.category_position ?? 0)
      : Number(row.position ?? 0),
    position: Number(row.position ?? 0),
    permissionOverrides:
      row.everyone_channel_partial ?? row.permission_overrides ?? null,
    slowmodeSeconds: Number(row.slowmode_seconds ?? 0),
    userLimit: Number(row.user_limit ?? 0),
    bitrateBps: row.bitrate_bps != null ? Number(row.bitrate_bps) : null,
    voiceE2eeEnabled: row.voice_e2ee_enabled === true,
    nsfw: Boolean(row.nsfw),
    iconKey: String(row.icon_key ?? ''),
    messageHistoryAnchor:
      String(row.message_history_anchor ?? 'bottom').toLowerCase() === 'top'
        ? 'top'
        : 'bottom',
    autoDeleteAfterSeconds:
      row.auto_delete_after_seconds != null
        ? Number(row.auto_delete_after_seconds)
        : null,
    autoDeleteSyncedToCategory: row.auto_delete_synced_to_category !== false,
    categoryAutoDeleteAfterSeconds:
      row.category_auto_delete_after_seconds != null
        ? Number(row.category_auto_delete_after_seconds)
        : null,
    discordVoiceMirrorOnly: row.discord_voice_mirror_only === true,
    discordChannelId:
      row.discord_channel_id != null
        ? String(row.discord_channel_id).trim()
        : undefined,
    messageFormatTemplate: String(row.message_format_template ?? ''),
    messageFormatHard: row.message_format_hard === true,
    forumAvailableTags: row.forum_available_tags ?? null,
    forumPostTagIds: row.forum_post_tag_ids ?? null,
    forumPostPinned: row.forum_post_pinned === true,
    forumPostLocked: row.forum_post_locked === true,
    forumPostArchivedAt:
      row.forum_post_archived_at != null
        ? new Date(String(row.forum_post_archived_at))
        : null,
    forumPostCreatorUserId:
      row.forum_post_creator_user_id != null &&
      String(row.forum_post_creator_user_id).trim()
        ? String(row.forum_post_creator_user_id)
        : undefined,
    forumCreatorDefaultPerms: row.forum_creator_default_perms ?? null,
  };
}

function echoChannelRowInternalToUiChannel(
  serverId: string,
  c: EchoChannelRowInternal,
): unknown {
  const ts = new Date().toISOString();
  const base: Record<string, unknown> = {
    id: c.id,
    name: c.name,
    type:
      c.type === 'voice'
        ? 'voice'
        : c.type === 'stage'
          ? 'stage'
          : c.type === 'forum'
            ? 'forum'
            : 'text',
    serverId,
    ...(c.parentChannelId ? { parentChannelId: c.parentChannelId } : {}),
    createdAt: ts,
    updatedAt: ts,
    slowModeSeconds: c.slowmodeSeconds ?? 0,
    userLimit: c.userLimit ?? 0,
    nsfw: c.nsfw ?? false,
    bitrateBps: c.bitrateBps ?? null,
    ...((c.type === 'voice' || c.type === 'stage') && c.voiceE2eeEnabled
      ? { voiceE2eeEnabled: true }
      : {}),
    ...(c.type === 'text' && c.messageHistoryAnchor === 'top'
      ? { messageHistoryAnchor: 'top' as const }
      : {}),
    ...(c.type === 'text' || c.type === 'forum'
      ? {
          autoDeleteAfterSeconds: c.autoDeleteAfterSeconds,
          autoDeleteSyncedToCategory: c.autoDeleteSyncedToCategory,
          categoryAutoDeleteAfterSeconds: c.categoryAutoDeleteAfterSeconds,
          ...(c.messageFormatTemplate.trim()
            ? {
                messageFormatTemplate: c.messageFormatTemplate,
                messageFormatHard: c.messageFormatHard === true,
              }
            : {}),
        }
      : {}),
    ...(c.iconKey?.trim() ? { iconKey: c.iconKey.trim() } : {}),
    ...(c.discordChannelId ? { discordChannelId: c.discordChannelId } : {}),
    ...(c.discordVoiceMirrorOnly ? { discordVoiceMirrorOnly: true } : {}),
    ...(c.type === 'forum' &&
    Array.isArray(c.forumAvailableTags) &&
    c.forumAvailableTags.length > 0
      ? { forumAvailableTags: c.forumAvailableTags }
      : {}),
    ...(Array.isArray(c.forumPostTagIds)
      ? { forumPostTagIds: c.forumPostTagIds }
      : {}),
    ...(c.forumPostPinned ? { forumPostPinned: true } : {}),
    ...(c.forumPostLocked ? { forumPostLocked: true } : {}),
    ...(c.forumPostArchivedAt
      ? { forumPostArchivedAt: c.forumPostArchivedAt.toISOString() }
      : {}),
    ...(c.type === 'forum' &&
    c.forumCreatorDefaultPerms != null &&
    typeof c.forumCreatorDefaultPerms === 'object' &&
    !Array.isArray(c.forumCreatorDefaultPerms)
      ? { forumCreatorDefaultPerms: c.forumCreatorDefaultPerms }
      : {}),
    ...(typeof c.forumPostCreatorUserId === 'string' &&
    c.forumPostCreatorUserId.trim()
      ? { forumPostCreatorUserId: c.forumPostCreatorUserId.trim() }
      : {}),
  };
  const ov = c.permissionOverrides;
  if (ov != null && typeof ov === 'object' && !Array.isArray(ov)) {
    return {
      ...base,
      channelPermissions: {
        syncWithCategory: false,
        overrides: echoPartialToChannelOverrides(ov as Record<string, unknown>),
      },
    };
  }
  return base;
}

/**
 * Interleave real categories and categoryless channels by compact `position`
 * (category.position vs channel.position in the same ordering space).
 */
export function mergeCategoriesAndUncategorizedRoots(
  serverId: string,
  cats: {
    id: string;
    name: string;
    position: number;
    autoDeleteAfterSeconds?: number | null;
  }[],
  rows: EchoChannelRowInternal[],
): EchoWorkspaceCategoryBootstrap[] {
  const roots = rows.filter((r) => !r.categoryId?.trim());
  const categorized = rows.filter((r) => !!r.categoryId?.trim());
  const grouped = groupEchoChannelRowsToWorkspaceCategories(
    serverId,
    categorized,
  );

  type Slot =
    | {
        type: 'cat';
        pos: number;
        tie: string;
        cat: {
          id: string;
          name: string;
          position: number;
          autoDeleteAfterSeconds?: number | null;
        };
      }
    | { type: 'root'; pos: number; tie: string; row: EchoChannelRowInternal };

  const slots: Slot[] = [];
  for (const cat of cats) {
    slots.push({ type: 'cat', pos: cat.position, tie: `c:${cat.id}`, cat });
  }
  for (const row of roots) {
    slots.push({ type: 'root', pos: row.position, tie: `r:${row.id}`, row });
  }
  slots.sort((a, b) => a.pos - b.pos || a.tie.localeCompare(b.tie));

  const out: EchoWorkspaceCategoryBootstrap[] = [];
  let i = 0;
  while (i < slots.length) {
    const s = slots[i]!;
    if (s.type === 'cat') {
      const { id, name } = s.cat;
      const g = grouped.get(id);
      out.push({
        id,
        name,
        channels: (g?.channels ?? []) as unknown[],
        channelPermissionDefaults: {},
        autoDeleteAfterSeconds: s.cat.autoDeleteAfterSeconds ?? null,
      });
      i += 1;
      continue;
    }
    const batch: EchoChannelRowInternal[] = [];
    while (i < slots.length && slots[i]!.type === 'root') {
      batch.push((slots[i] as Extract<Slot, { type: 'root' }>).row);
      i += 1;
    }
    if (batch.length === 0) continue;
    out.push({
      id: `__uncategorized_${batch[0]!.id}`,
      name: 'Uncategorized',
      hideCategoryHeader: true,
      channels: batch.map((r) =>
        echoChannelRowInternalToUiChannel(serverId, r),
      ) as unknown[],
      channelPermissionDefaults: {},
    });
  }
  return out;
}

/** Group channel rows into UI categories (same ordering rules as `groupEchoChannelsToCategories` on the client). */
function groupEchoChannelRowsToWorkspaceCategories(
  serverId: string,
  channels: EchoChannelRowInternal[],
): Map<string, { name: string; channels: unknown[] }> {
  const order: string[] = [];
  const map = new Map<string, EchoChannelRowInternal[]>();
  for (const ch of channels) {
    const cid = ch.categoryId?.trim() || '';
    if (!cid) continue;
    if (!map.has(cid)) {
      map.set(cid, []);
      order.push(cid);
    }
    map.get(cid)!.push(ch);
  }
  const out = new Map<string, { name: string; channels: unknown[] }>();
  for (const cid of order) {
    const chs = map.get(cid)!;
    chs.sort((a, b) => a.position - b.position);
    const name = chs[0]?.categoryName?.trim() || 'Text Channels';
    const uiChannels = chs.map((c) =>
      echoChannelRowInternalToUiChannel(serverId, c),
    );
    out.set(cid, { name, channels: uiChannels });
  }
  return out;
}

/** Member row for workspace bootstrap (member list, mentions, pings). */
export type EchoWorkspaceMemberDto = {
  userId: string;
  /**
   * Effective display name **in this server** (server nickname if set, else account display / username).
   * Used for roster ordering and anywhere we need one label without client-side merging.
   */
  name: string;
  /**
   * Account-level display for merging into `users[]` (ignores server nickname so DMs / other guilds stay correct).
   */
  accountDisplayName?: string;
  /** Trimmed server nickname when set; omitted when empty. */
  serverNickname?: string;
  username?: string;
  pfp: string;
  isDiscordShadow?: boolean;
  /** True when the account is an Echo guest (cannot use Friends on either side of a request). */
  isGuest?: boolean;
  /** ISO timestamp until which communication is disabled in this server. */
  communicationTimeoutUntil?: string | null;
  /** When this user joined this server (`echo_server_members.joined_at`). */
  joinedAt?: string;
  /**
   * Monotonic full-account signup index from `auth_users.signup_ordinal` (higher = newer).
   * Used for friend suggestions and other “recent Echo signups” surfaces.
   */
  signupOrdinal?: number;
  /** Profile badges derived from `auth_users` (e.g. OG for early signups). */
  badges?: string[];
  /** Account profile banner (same row as pfp) — other clients need this in workspace to render updated banners. */
  bannerImage?: string;
  bannerColor?: string;
  bannerRefractionEnabled?: boolean;
  bannerBlurEnabled?: boolean;
  bannerBlackoutEnabled?: boolean;
  /** 0–100, vertical focal point for the banner image. */
  bannerPositionY?: number;
  /** Profile bio text from `auth_users.bio`. */
  bio?: string;
  /** IANA timezone for Magic Time (`auth_users.time_zone`). */
  timeZone: string | null;
};

/** One-shot workspace payload: joined servers, category/channel trees, and member rosters per server. */
export async function listEchoWorkspaceForUser(
  pool: pg.Pool,
  userId: string,
): Promise<{
  servers: Awaited<ReturnType<typeof listEchoServersForUser>>;
  categoriesByServer: Record<string, EchoWorkspaceCategoryBootstrap[]>;
  membersByServer: Record<string, EchoWorkspaceMemberDto[]>;
  workspaceVersion: string;
  upcomingEventsByServerId: Record<string, EchoWorkspaceEventSummary[]>;
  myEventRsvps: EchoWorkspaceMyEventRsvp[];
}> {
  const servers = await listEchoServersForUser(pool, userId);
  if (servers.length === 0) {
    return {
      servers,
      categoriesByServer: {},
      membersByServer: {},
      workspaceVersion: '0',
      upcomingEventsByServerId: {},
      myEventRsvps: [],
    };
  }
  const serverIds = servers.map((s) => s.id);

  const [catRes, chRes, memRes] = await Promise.all([
    pool.query(
      `
      SELECT id, server_id, name, position, auto_delete_after_seconds
      FROM echo_categories
      WHERE server_id = ANY($1::text[])
      ORDER BY server_id, position ASC, name ASC
      `,
      [serverIds],
    ),
    pool.query(
      `
      SELECT ch.id, ch.server_id, ch.name, ch.type, ch.position, ch.permission_overrides,
             ch.slowmode_seconds, ch.user_limit, ch.bitrate_bps, ch.voice_e2ee_enabled, ch.nsfw, ch.icon_key,
             ch.message_history_anchor,
             ch.auto_delete_after_seconds, ch.auto_delete_synced_to_category,
             ch.message_format_template, ch.message_format_hard,
             ch.parent_channel_id, ch.forum_available_tags, ch.forum_post_tag_ids,
             ch.forum_post_pinned, ch.forum_post_locked, ch.forum_post_archived_at,
             ch.forum_post_creator_user_id, ch.forum_creator_default_perms,
             cat.id AS category_id, cat.name AS category_name, cat.position AS category_position,
           cat.auto_delete_after_seconds AS category_auto_delete_after_seconds,
             ow.partial AS everyone_channel_partial,
             COALESCE(
               NULLIF(BTRIM(mi.discord_channel_id::text), ''),
               dmap.discord_from_import_map
             ) AS discord_channel_id
      FROM echo_channels ch
      LEFT JOIN echo_categories cat ON cat.id = ch.category_id AND cat.server_id = ch.server_id
      LEFT JOIN echo_channel_permission_overwrite_rows ow
        ON ow.channel_id = ch.id AND ow.server_id = ch.server_id AND ow.target_type = 'everyone'
      LEFT JOIN echo_discord_channel_message_imports mi ON mi.channel_id = ch.id
      LEFT JOIN LATERAL (
        SELECT kv.key AS discord_from_import_map
        FROM echo_discord_import_states ist
        CROSS JOIN LATERAL jsonb_each_text(ist.channel_id_map) AS kv(key, value)
        WHERE ist.server_id = ch.server_id
          AND ist.channels_imported_at IS NOT NULL
          AND kv.value = ch.id
        LIMIT 1
      ) dmap ON true
      WHERE ch.server_id = ANY($1::text[])
      ORDER BY ch.server_id, (ch.category_id IS NULL) ASC, cat.position ASC NULLS LAST, ch.position ASC, ch.name ASC
      `,
      [serverIds],
    ),
    pool.query(
      `
      SELECT m.server_id, m.user_id, m.joined_at,
             NULLIF(TRIM(m.nickname), '') AS server_nickname,
             COALESCE(
               NULLIF(TRIM(u.display_name), ''),
               NULLIF(TRIM(u.username), ''),
               'Unknown'
             ) AS account_display_name,
             COALESCE(
               NULLIF(TRIM(m.nickname), ''),
               NULLIF(TRIM(u.display_name), ''),
               NULLIF(TRIM(u.username), ''),
               'Unknown'
             ) AS name,
             NULLIF(TRIM(u.username), '') AS username,
             COALESCE(u.pfp, '') AS pfp,
             u.is_discord_shadow,
             d.discord_user_id AS shadow_discord_user_id,
             COALESCE(u.is_guest, false) AS is_guest,
             u.signup_ordinal,
             COALESCE(u.bio, '') AS account_bio,
             COALESCE(u.banner_image, '') AS banner_image,
             COALESCE(u.banner_color, '') AS banner_color,
             u.banner_refraction_enabled,
             u.banner_blur_enabled,
             u.banner_blackout_enabled,
             u.banner_position_y,
             NULLIF(TRIM(u.time_zone), '') AS time_zone,
             t.timeout_until AS communication_timeout_until
      FROM echo_server_members m
      INNER JOIN auth_users u ON u.id = m.user_id
      LEFT JOIN echo_discord_shadow_users d ON d.shadow_user_id = u.id
      LEFT JOIN echo_server_member_timeouts t
        ON t.server_id = m.server_id
       AND t.user_id = m.user_id
       AND t.timeout_until > NOW()
      WHERE m.server_id = ANY($1::text[])
      ORDER BY m.server_id,
               LOWER(COALESCE(
                 NULLIF(TRIM(m.nickname), ''),
                 NULLIF(TRIM(u.display_name), ''),
                 NULLIF(TRIM(u.username), ''),
                 'Unknown'
               )) ASC,
               m.user_id ASC
      `,
      [serverIds],
    ),
  ]);

  const membersByServer: Record<string, EchoWorkspaceMemberDto[]> = {};
  for (const sid of serverIds) {
    membersByServer[sid] = [];
  }
  for (const row of memRes.rows as Record<string, unknown>[]) {
    const sid = String(row.server_id ?? '');
    if (!sid || !membersByServer[sid]) continue;
    const rawPfp = String(row.pfp ?? '').trim();
    const shadowDid =
      row.shadow_discord_user_id != null
        ? String(row.shadow_discord_user_id).trim()
        : '';
    const pfp =
      row.is_discord_shadow === true && shadowDid
        ? resolveDiscordAvatarForStorage(
            shadowDid,
            rawPfp === '' ? null : rawPfp,
          )
        : rawPfp;
    const joinedRaw = (row as { joined_at?: unknown }).joined_at;
    const joinedAt =
      joinedRaw instanceof Date
        ? joinedRaw.toISOString()
        : typeof joinedRaw === 'string' && joinedRaw.trim()
          ? new Date(joinedRaw).toISOString()
          : undefined;
    const ordRaw = (row as { signup_ordinal?: unknown }).signup_ordinal;
    const signupOrdinal =
      ordRaw != null && ordRaw !== '' ? Number(ordRaw) : Number.NaN;
    const badges = publicBadgesFromSignupOrdinal(
      Number.isFinite(signupOrdinal) ? signupOrdinal : null,
      {
        isGuest: row.is_guest === true,
        isDiscordShadow: row.is_discord_shadow === true,
      },
    );
    const serverNickRaw = row.server_nickname;
    const serverNickname =
      typeof serverNickRaw === 'string' && serverNickRaw.trim()
        ? serverNickRaw.trim().slice(0, 32)
        : '';
    const accountRaw = row.account_display_name;
    const accountDisplayName =
      typeof accountRaw === 'string' && accountRaw.trim()
        ? accountRaw.trim()
        : undefined;

    const accountBio = String(
      (row as { account_bio?: unknown }).account_bio ?? '',
    ).trim();
    const timeZoneRaw = (row as { time_zone?: unknown }).time_zone;
    const timeZone =
      typeof timeZoneRaw === 'string' && timeZoneRaw.trim()
        ? timeZoneRaw.trim().slice(0, 64)
        : null;
    const bannerImage = String(
      (row as { banner_image?: unknown }).banner_image ?? '',
    ).trim();
    const bannerColor = String(
      (row as { banner_color?: unknown }).banner_color ?? '',
    ).trim();
    const bannerRefraction = (row as { banner_refraction_enabled?: unknown })
      .banner_refraction_enabled;
    const bannerBlur = (row as { banner_blur_enabled?: unknown })
      .banner_blur_enabled;
    const bannerBlackout = (row as { banner_blackout_enabled?: unknown })
      .banner_blackout_enabled;
    const byRaw = (row as { banner_position_y?: unknown }).banner_position_y;
    const bannerPositionY =
      typeof byRaw === 'number' && Number.isFinite(byRaw)
        ? byRaw
        : Number(byRaw);
    const bannerPositionYClamped = Number.isFinite(bannerPositionY)
      ? Math.max(0, Math.min(100, bannerPositionY))
      : 50;

    membersByServer[sid]!.push({
      userId: String(row.user_id ?? ''),
      name: String(row.name ?? 'Unknown'),
      ...(accountDisplayName ? { accountDisplayName } : {}),
      ...(serverNickname ? { serverNickname } : {}),
      ...(typeof row.username === 'string' && row.username.trim()
        ? { username: row.username.trim() }
        : {}),
      pfp,
      isDiscordShadow: row.is_discord_shadow === true,
      isGuest: row.is_guest === true,
      communicationTimeoutUntil:
        row.communication_timeout_until instanceof Date
          ? row.communication_timeout_until.toISOString()
          : row.communication_timeout_until != null
            ? String(row.communication_timeout_until)
            : null,
      ...(joinedAt ? { joinedAt } : {}),
      ...(Number.isFinite(signupOrdinal) ? { signupOrdinal } : {}),
      ...(badges.length ? { badges } : {}),
      bannerImage,
      bannerColor,
      bannerRefractionEnabled: bannerRefraction === true,
      bannerBlurEnabled: bannerBlur === true,
      bannerBlackoutEnabled: bannerBlackout === true,
      bannerPositionY: bannerPositionYClamped,
      bio: accountBio,
      timeZone,
    });
  }

  const categoriesByServerId = new Map<
    string,
    {
      id: string;
      name: string;
      position: number;
      autoDeleteAfterSeconds: number | null;
    }[]
  >();
  for (const row of catRes.rows as any[]) {
    const sid = String(row.server_id);
    if (!categoriesByServerId.has(sid)) categoriesByServerId.set(sid, []);
    categoriesByServerId.get(sid)!.push({
      id: String(row.id),
      name: String(row.name),
      position: Number(row.position ?? 0),
      autoDeleteAfterSeconds:
        row.auto_delete_after_seconds != null
          ? Number(row.auto_delete_after_seconds)
          : null,
    });
  }

  const channelsByServerId = new Map<string, EchoChannelRowInternal[]>();
  for (const row of chRes.rows as any[]) {
    const sid = String(row.server_id);
    if (!channelsByServerId.has(sid)) channelsByServerId.set(sid, []);
    channelsByServerId.get(sid)!.push(mapWorkspaceChannelQueryRow(row));
  }

  const categoriesByServer: Record<string, EchoWorkspaceCategoryBootstrap[]> =
    {};
  for (const sid of serverIds) {
    const cats = categoriesByServerId.get(sid) ?? [];
    const channels = channelsByServerId.get(sid) ?? [];
    categoriesByServer[sid] = mergeCategoriesAndUncategorizedRoots(
      sid,
      cats,
      channels,
    );
  }

  const workspaceVersion = await getEchoWorkspaceVersionForServers(
    pool,
    serverIds,
  );
  await attachChannelPermissionCapsAndStripInvisibleForWorkspace(
    pool,
    userId,
    categoriesByServer,
  );
  await attachAccessibleMemberUserIdsToWorkspaceChannels(
    pool,
    servers,
    categoriesByServer,
    membersByServer,
  );
  await attachVoiceParticipantsToWorkspace(pool, serverIds, categoriesByServer);
  const { upcomingEventsByServerId, myEventRsvps } =
    await loadEchoWorkspaceEventPayload(pool, userId, serverIds);
  return {
    servers,
    categoriesByServer,
    membersByServer,
    workspaceVersion,
    upcomingEventsByServerId,
    myEventRsvps,
  };
}

/**
 * Per-channel effective permissions (same engine as `/channels/:id/capabilities`).
 * Strips channels the member cannot VIEW_CHANNEL so they never appear in workspace JSON
 * (sidebar, search channel lists, etc. that consume this snapshot).
 */
async function attachChannelPermissionCapsAndStripInvisibleForWorkspace(
  pool: pg.Pool,
  userId: string,
  categoriesByServer: Record<string, EchoWorkspaceCategoryBootstrap[]>,
): Promise<void> {
  const permsPromises = Object.keys(categoriesByServer).map(async (sid) => {
    const cats = categoriesByServer[sid];
    if (!cats) return;

    const channelMap = new Map<string, Record<string, unknown>>();
    for (const cat of cats) {
      for (const raw of cat.channels) {
        const ch = raw as Record<string, unknown>;
        const id = typeof ch.id === 'string' ? ch.id : '';
        if (id) channelMap.set(id, ch);
      }
    }

    const channelIds = [...channelMap.keys()];
    if (channelIds.length === 0) return;

    let permsMap: Map<string, Set<string>>;
    try {
      permsMap = await batchGetEffectiveChannelPermissions(
        pool,
        sid,
        userId,
        channelIds,
      );
    } catch {
      for (const ch of channelMap.values()) {
        ch.canManageChannel = false;
        ch.canManageWebhooks = false;
        ch.canViewChannel = false;
      }
      permsMap = new Map();
    }

    for (const [id, ch] of channelMap) {
      const perms = permsMap.get(id);
      ch.canManageChannel = perms ? perms.has('MANAGE_CHANNELS') : false;
      ch.canManageWebhooks = perms
        ? perms.has('MANAGE_WEBHOOKS') ||
          perms.has('MANAGE_GUILD') ||
          perms.has('ADMINISTRATOR')
        : false;
      ch.canViewChannel = perms ? perms.has('VIEW_CHANNEL') : false;
    }

    await applyForumCreatorManageChannelBoost(pool, sid, userId, channelMap);

    categoriesByServer[sid] = cats.filter((cat) => {
      const hadChannelsBeforeVisibilityFilter = cat.channels.length > 0;
      cat.channels = cat.channels.filter((raw) => {
        const ch = raw as Record<string, unknown>;
        return ch.canViewChannel === true;
      });
      for (const raw of cat.channels) {
        const ch = raw as Record<string, unknown>;
        delete ch.canViewChannel;
      }
      // Keep truly empty categories so newly created sections remain visible.
      // Drop categories that only became empty because all channels were hidden.
      return cat.channels.length > 0 || !hadChannelsBeforeVisibilityFilter;
    });
  });

  await Promise.all(permsPromises);
}

type WorkspaceChannelAccessRole = {
  id: string;
  position: number;
  permissions: unknown;
};

function composeWorkspaceAccessKey(serverId: string, entityId: string): string {
  return `${serverId}:${entityId}`;
}

async function attachAccessibleMemberUserIdsToWorkspaceChannels(
  pool: pg.Pool,
  servers: Awaited<ReturnType<typeof listEchoServersForUser>>,
  categoriesByServer: Record<string, EchoWorkspaceCategoryBootstrap[]>,
  membersByServer: Record<string, EchoWorkspaceMemberDto[]>,
): Promise<void> {
  const ownerIdByServer = new Map(
    servers.map((server) => [server.id, server.ownerId] as const),
  );
  const visibleServerIds = Object.entries(categoriesByServer)
    .filter(([, categories]) =>
      (categories ?? []).some((category) => category.channels.length > 0),
    )
    .map(([serverId]) => serverId);
  if (visibleServerIds.length === 0) return;

  const visibleChannelIds: string[] = [];
  const visibleChannelIdsSeen = new Set<string>();
  const memberUserIds: string[] = [];
  const memberUserIdsSeen = new Set<string>();

  for (const serverId of visibleServerIds) {
    for (const member of membersByServer[serverId] ?? []) {
      const memberUserId = member.userId.trim();
      if (!memberUserId || memberUserIdsSeen.has(memberUserId)) continue;
      memberUserIdsSeen.add(memberUserId);
      memberUserIds.push(memberUserId);
    }
    for (const category of categoriesByServer[serverId] ?? []) {
      for (const rawChannel of category.channels) {
        const channel = rawChannel as Record<string, unknown>;
        const channelId =
          typeof channel.id === 'string' ? channel.id.trim() : '';
        if (!channelId || visibleChannelIdsSeen.has(channelId)) continue;
        visibleChannelIdsSeen.add(channelId);
        visibleChannelIds.push(channelId);
      }
    }
  }

  if (visibleChannelIds.length === 0 || memberUserIds.length === 0) return;

  const [roleRes, assignmentRes, channelInfoRes] = await Promise.all([
    pool.query(
      `
      SELECT server_id, id, position, permissions, name
      FROM echo_roles
      WHERE server_id = ANY($1::text[])
      ORDER BY server_id, position ASC, id ASC
      `,
      [visibleServerIds],
    ),
    pool.query(
      `
      SELECT mr.server_id, mr.user_id, r.id, r.position, r.permissions
      FROM echo_member_roles mr
      INNER JOIN echo_roles r ON r.id = mr.role_id AND r.server_id = mr.server_id
      WHERE mr.server_id = ANY($1::text[])
        AND mr.user_id = ANY($2::text[])
      ORDER BY mr.server_id, mr.user_id, r.position ASC, r.id ASC
      `,
      [visibleServerIds, memberUserIds],
    ),
    pool.query(
      `
      SELECT id, server_id, category_id, permission_overrides
      FROM echo_channels
      WHERE server_id = ANY($1::text[])
        AND id = ANY($2::text[])
      `,
      [visibleServerIds, visibleChannelIds],
    ),
  ]);

  const everyoneRoleByServer = new Map<string, WorkspaceChannelAccessRole>();
  for (const row of roleRes.rows as Record<string, unknown>[]) {
    if (String(row.name ?? '') !== '@everyone') continue;
    everyoneRoleByServer.set(String(row.server_id), {
      id: String(row.id),
      position: Number(row.position ?? 0),
      permissions: row.permissions,
    });
  }

  const rolesByServerUser = new Map<string, WorkspaceChannelAccessRole[]>();
  for (const row of assignmentRes.rows as Record<string, unknown>[]) {
    const key = composeWorkspaceAccessKey(
      String(row.server_id),
      String(row.user_id),
    );
    const roles = rolesByServerUser.get(key) ?? [];
    roles.push({
      id: String(row.id),
      position: Number(row.position ?? 0),
      permissions: row.permissions,
    });
    rolesByServerUser.set(key, roles);
  }

  const channelInfoById = new Map<
    string,
    {
      categoryId: string;
      permissionOverrides: unknown;
    }
  >();
  const categoryIds = new Set<string>();
  for (const row of channelInfoRes.rows as Record<string, unknown>[]) {
    const categoryId = String(row.category_id ?? '');
    const channelId = String(row.id);
    channelInfoById.set(channelId, {
      categoryId,
      permissionOverrides: row.permission_overrides,
    });
    if (categoryId) categoryIds.add(categoryId);
  }

  const categoryIdList = [...categoryIds];
  const [categoryOverwriteRes, channelOverwriteRes] = await Promise.all([
    categoryIdList.length > 0
      ? pool.query(
          `
          SELECT server_id, category_id, id, target_type, target_id, partial
          FROM echo_category_permission_overwrite_rows
          WHERE server_id = ANY($1::text[])
            AND category_id = ANY($2::text[])
          `,
          [visibleServerIds, categoryIdList],
        )
      : Promise.resolve({ rows: [] } as { rows: Record<string, unknown>[] }),
    pool.query(
      `
      SELECT server_id, channel_id, id, target_type, target_id, partial
      FROM echo_channel_permission_overwrite_rows
      WHERE server_id = ANY($1::text[])
        AND channel_id = ANY($2::text[])
      `,
      [visibleServerIds, visibleChannelIds],
    ),
  ]);

  const categoryOverwriteRowsByKey = new Map<string, DbOverwriteRow[]>();
  for (const row of categoryOverwriteRes.rows as Record<string, unknown>[]) {
    const key = composeWorkspaceAccessKey(
      String(row.server_id),
      String(row.category_id),
    );
    const rows = categoryOverwriteRowsByKey.get(key) ?? [];
    rows.push({
      id: String(row.id),
      target_type: String(row.target_type),
      target_id: row.target_id != null ? String(row.target_id) : null,
      partial: row.partial,
    });
    categoryOverwriteRowsByKey.set(key, rows);
  }

  const categoryLegacyOverrideByKey = new Map<
    string,
    Record<string, unknown>
  >();
  if (categoryIdList.length > 0) {
    const categoryLegacyRes = await pool.query(
      `
      SELECT server_id, category_id, permission_overrides
      FROM echo_category_permission_overrides
      WHERE server_id = ANY($1::text[])
        AND category_id = ANY($2::text[])
      `,
      [visibleServerIds, categoryIdList],
    );
    for (const row of categoryLegacyRes.rows as Record<string, unknown>[]) {
      const raw = row.permission_overrides;
      if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
        continue;
      }
      categoryLegacyOverrideByKey.set(
        composeWorkspaceAccessKey(
          String(row.server_id),
          String(row.category_id),
        ),
        raw as Record<string, unknown>,
      );
    }
  }

  const channelOverwriteRowsByKey = new Map<string, DbOverwriteRow[]>();
  for (const row of channelOverwriteRes.rows as Record<string, unknown>[]) {
    const key = composeWorkspaceAccessKey(
      String(row.server_id),
      String(row.channel_id),
    );
    const rows = channelOverwriteRowsByKey.get(key) ?? [];
    rows.push({
      id: String(row.id),
      target_type: String(row.target_type),
      target_id: row.target_id != null ? String(row.target_id) : null,
      partial: row.partial,
    });
    channelOverwriteRowsByKey.set(key, rows);
  }

  for (const serverId of visibleServerIds) {
    const ownerId = ownerIdByServer.get(serverId) ?? '';
    const fallbackRoles = (() => {
      const everyoneRole = everyoneRoleByServer.get(serverId);
      return everyoneRole ? [everyoneRole] : [];
    })();
    const serverMembers = membersByServer[serverId] ?? [];

    for (const category of categoriesByServer[serverId] ?? []) {
      for (const rawChannel of category.channels) {
        const channel = rawChannel as Record<string, unknown>;
        const channelId =
          typeof channel.id === 'string' ? channel.id.trim() : '';
        if (!channelId) continue;
        const channelInfo = channelInfoById.get(channelId);
        if (!channelInfo) {
          channel.accessibleMemberUserIds = [];
          continue;
        }

        const channelKey = composeWorkspaceAccessKey(serverId, channelId);
        const channelOverwriteRows =
          channelOverwriteRowsByKey.get(channelKey) ?? [];
        const categoryKey = channelInfo.categoryId
          ? composeWorkspaceAccessKey(serverId, channelInfo.categoryId)
          : '';
        const categoryOverwriteRows = categoryKey
          ? (categoryOverwriteRowsByKey.get(categoryKey) ?? [])
          : [];
        const categoryLegacyOverride = categoryKey
          ? (categoryLegacyOverrideByKey.get(categoryKey) ?? null)
          : null;
        const accessibleMemberUserIds: string[] = [];

        for (const member of serverMembers) {
          const memberUserId = member.userId.trim();
          if (!memberUserId) continue;
          if (ownerId && memberUserId === ownerId) {
            accessibleMemberUserIds.push(memberUserId);
            continue;
          }

          const roles =
            rolesByServerUser.get(
              composeWorkspaceAccessKey(serverId, memberUserId),
            ) ?? fallbackRoles;
          if (roles.length === 0) continue;

          const categoryOverride =
            categoryOverwriteRows.length > 0
              ? mergeOverwritesForMember(
                  categoryOverwriteRows,
                  roles,
                  memberUserId,
                )
              : categoryLegacyOverride;

          const channelOverride =
            channelOverwriteRows.length > 0
              ? mergeOverwritesForMember(
                  channelOverwriteRows,
                  roles,
                  memberUserId,
                )
              : channelInfo.permissionOverrides != null &&
                  typeof channelInfo.permissionOverrides === 'object' &&
                  !Array.isArray(channelInfo.permissionOverrides)
                ? (channelInfo.permissionOverrides as Record<string, unknown>)
                : null;

          const { effective } = executeEvaluationPlan(
            {
              kind: 'evaluate',
              roles,
              categoryOverride,
              channelOverride,
            },
            'compressed',
          );
          if (effective.has('VIEW_CHANNEL')) {
            accessibleMemberUserIds.push(memberUserId);
          }
        }

        channel.accessibleMemberUserIds = accessibleMemberUserIds;
      }
    }
  }
}

function normalizeDistinctVoiceParticipantIds(
  ids: Iterable<unknown>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function diffEchoVoiceParticipantRosterAgainstLiveKit(opts: {
  dbUserIds: Iterable<unknown>;
  liveKitIdentities: Iterable<unknown>;
}): {
  dbUserIds: string[];
  liveKitIdentities: string[];
  dbOnlyUserIds: string[];
  liveKitOnlyUserIds: string[];
} {
  const dbUserIds = normalizeDistinctVoiceParticipantIds(opts.dbUserIds);
  const liveKitIdentities = normalizeDistinctVoiceParticipantIds(
    opts.liveKitIdentities,
  );
  const dbSet = new Set(dbUserIds);
  const liveKitSet = new Set(liveKitIdentities);
  return {
    dbUserIds,
    liveKitIdentities,
    dbOnlyUserIds: dbUserIds.filter((id) => !liveKitSet.has(id)),
    liveKitOnlyUserIds: liveKitIdentities.filter((id) => !dbSet.has(id)),
  };
}

/**
 * `echo_voice_participants` is the Echo workspace authority for membership. We only trace
 * LiveKit mismatches here: destructive pruning during snapshot hydrate caused legitimate
 * rows to disappear while join/webhook ordering was still catching up.
 */
async function traceVoiceParticipantRowsAgainstLiveKit(
  pool: pg.Pool,
  serverIds: string[],
): Promise<void> {
  if (!config.liveKitEnabled || serverIds.length === 0) return;
  const distinct = await pool.query(
    `SELECT server_id, channel_id, ARRAY_AGG(user_id ORDER BY joined_at ASC) AS user_ids
     FROM echo_voice_participants
     WHERE server_id = ANY($1::text[])
     GROUP BY server_id, channel_id`,
    [serverIds],
  );
  for (const row of distinct.rows as {
    server_id: unknown;
    channel_id: unknown;
    user_ids: unknown;
  }[]) {
    const serverId = String(row.server_id);
    const channelId = String(row.channel_id);
    const roomName = liveKitRoomName(serverId, channelId);
    let participants: Awaited<ReturnType<typeof listLiveKitParticipants>>;
    try {
      participants = await listLiveKitParticipants(roomName);
    } catch (e) {
      vcTrace(undefined, 'voice.prune:listParticipants_failed', {
        roomName,
        err: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    const diff = diffEchoVoiceParticipantRosterAgainstLiveKit({
      dbUserIds: Array.isArray(row.user_ids) ? row.user_ids : [],
      liveKitIdentities: participants.map((p) => p.identity),
    });
    if (diff.dbOnlyUserIds.length === 0 && diff.liveKitOnlyUserIds.length === 0)
      continue;
    vcTrace(undefined, 'voice.snapshot:livekit_roster_mismatch', {
      roomName,
      serverId,
      channelId,
      dbUserIds: diff.dbUserIds,
      liveKitIdentities: diff.liveKitIdentities,
      dbOnlyUserIds: diff.dbOnlyUserIds,
      liveKitOnlyUserIds: diff.liveKitOnlyUserIds,
    });
  }
}

async function attachVoiceParticipantsToWorkspace(
  pool: pg.Pool,
  serverIds: string[],
  categoriesByServer: Record<string, EchoWorkspaceCategoryBootstrap[]>,
): Promise<void> {
  if (serverIds.length === 0) return;
  await traceVoiceParticipantRowsAgainstLiveKit(pool, serverIds);
  const vpRes = await pool.query(
    `SELECT server_id, channel_id, user_id, server_muted, server_deafened, stage_speaker
     FROM echo_voice_participants
     WHERE server_id = ANY($1::text[])
     ORDER BY server_id, channel_id, joined_at ASC`,
    [serverIds],
  );
  const map = new Map<string, string[]>();
  const muteMaps = new Map<string, Record<string, boolean>>();
  const deafMaps = new Map<string, Record<string, boolean>>();
  const speakerMaps = new Map<string, Record<string, boolean>>();
  for (const row of vpRes.rows as {
    server_id: unknown;
    channel_id: unknown;
    user_id: unknown;
    server_muted: unknown;
    server_deafened: unknown;
    stage_speaker: unknown;
  }[]) {
    const key = `${row.server_id}:${row.channel_id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(String(row.user_id));
    const uid = String(row.user_id);
    if (row.server_muted === true) {
      if (!muteMaps.has(key)) muteMaps.set(key, {});
      muteMaps.get(key)![uid] = true;
    }
    if (row.server_deafened === true) {
      if (!deafMaps.has(key)) deafMaps.set(key, {});
      deafMaps.get(key)![uid] = true;
    }
    if (row.stage_speaker === true) {
      if (!speakerMaps.has(key)) speakerMaps.set(key, {});
      speakerMaps.get(key)![uid] = true;
    }
  }
  for (const sid of Object.keys(categoriesByServer)) {
    const cats = categoriesByServer[sid];
    if (!cats) continue;
    for (const cat of cats) {
      for (const raw of cat.channels) {
        const ch = raw as Record<string, unknown>;
        if (ch.type !== 'voice' && ch.type !== 'stage') continue;
        const ckey = `${sid}:${ch.id}`;
        const ids = map.get(ckey) ?? [];
        if (ids.length > 0) {
          ch.voiceParticipantIds = ids;
        }
        const muteM = muteMaps.get(ckey);
        if (muteM && Object.keys(muteM).length > 0) {
          ch.voiceServerMuteByUserId = muteM;
        }
        const deafM = deafMaps.get(ckey);
        if (deafM && Object.keys(deafM).length > 0) {
          ch.voiceServerDeafenByUserId = deafM;
        }
        if (ch.type === 'stage') {
          const spkM = speakerMaps.get(ckey);
          if (spkM && Object.keys(spkM).length > 0) {
            ch.voiceStageSpeakerByUserId = spkM;
          }
        }
      }
    }
  }
}

export type CreateEchoCategoryResult =
  | { categoryId: string }
  | 'forbidden'
  | 'invalid_body'
  | 'duplicate_name';

export async function createEchoCategory(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  body: { name: string; position?: number },
): Promise<CreateEchoCategoryResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!actorPerms.has('MANAGE_CHANNELS') && !actorPerms.has('MANAGE_GUILD'))
    return 'forbidden';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return 'invalid_body';
  const dup = await pool.query(
    `SELECT 1 FROM echo_categories WHERE server_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
    [serverId, name],
  );
  if (dup.rows.length > 0) return 'duplicate_name';
  const pRow = await pool.query(
    `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM echo_categories WHERE server_id = $1`,
    [serverId],
  );
  const next = Number(pRow.rows[0]?.p ?? 0);
  const pos =
    typeof body.position === 'number' &&
    Number.isFinite(body.position) &&
    body.position >= 0
      ? Math.floor(body.position)
      : next;
  const id = nextEchoSnowflakeId();
  await pool.query(
    `INSERT INTO echo_categories (id, server_id, name, position) VALUES ($1, $2, $3, $4)`,
    [id, serverId, name, pos],
  );
  invalidateEchoPermissionCacheForServer(serverId);
  return { categoryId: id };
}

export type UpdateEchoCategoryResult =
  | 'ok'
  | 'forbidden'
  | 'not_found'
  | 'invalid_body'
  | 'duplicate_name';

export async function updateEchoCategory(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  categoryId: string,
  body: {
    name?: string;
    position?: number;
    autoDeleteAfterSeconds?: number | null;
  },
): Promise<UpdateEchoCategoryResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!actorPerms.has('MANAGE_CHANNELS') && !actorPerms.has('MANAGE_GUILD'))
    return 'forbidden';
  const exists = await pool.query(
    `SELECT 1 FROM echo_categories WHERE id = $1 AND server_id = $2`,
    [categoryId, serverId],
  );
  if (exists.rows.length === 0) return 'not_found';
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return 'invalid_body';
    const dup = await pool.query(
      `SELECT 1 FROM echo_categories WHERE server_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3 LIMIT 1`,
      [serverId, name, categoryId],
    );
    if (dup.rows.length > 0) return 'duplicate_name';
    await pool.query(
      `UPDATE echo_categories SET name = $1 WHERE id = $2 AND server_id = $3`,
      [name, categoryId, serverId],
    );
  }
  if (body.position !== undefined) {
    const pos =
      typeof body.position === 'number' &&
      Number.isFinite(body.position) &&
      body.position >= 0
        ? Math.floor(body.position)
        : null;
    if (pos === null) return 'invalid_body';
    await pool.query(
      `UPDATE echo_categories SET position = $1 WHERE id = $2 AND server_id = $3`,
      [pos, categoryId, serverId],
    );
  }
  if (body.autoDeleteAfterSeconds !== undefined) {
    const parsed = parseAutoDeleteAfterSecondsPatch(
      body.autoDeleteAfterSeconds,
    );
    if (parsed === undefined) return 'invalid_body';
    await pool.query(
      `UPDATE echo_categories SET auto_delete_after_seconds = $1 WHERE id = $2 AND server_id = $3`,
      [parsed, categoryId, serverId],
    );
  }
  invalidateEchoPermissionCacheForServer(serverId);
  return 'ok';
}

export type ApplyEchoCategoryPlacementResult =
  | 'ok'
  | 'forbidden'
  | 'not_found'
  | 'invalid_body';

/**
 * Reorder categories on a server (compact `position` in category list order).
 * Ordering is `position ASC, name ASC` — same as `listEchoCategories` / channel tree ordering.
 */
export async function applyEchoCategoryPlacement(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  categoryId: string,
  siblingIndex: number,
): Promise<ApplyEchoCategoryPlacementResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!actorPerms.has('MANAGE_CHANNELS') && !actorPerms.has('MANAGE_GUILD'))
    return 'forbidden';

  if (
    typeof siblingIndex !== 'number' ||
    !Number.isFinite(siblingIndex) ||
    siblingIndex < 0 ||
    siblingIndex !== Math.floor(siblingIndex)
  ) {
    return 'invalid_body';
  }

  const list = await pool.query(
    `SELECT id FROM echo_categories WHERE server_id = $1 ORDER BY position ASC, name ASC`,
    [serverId],
  );
  const ids = list.rows.map((row: any) => String(row.id));
  if (!ids.includes(categoryId)) return 'not_found';

  const without = ids.filter((id) => id !== categoryId);
  const clamped = Math.min(siblingIndex, without.length);
  const nextOrder = [
    ...without.slice(0, clamped),
    categoryId,
    ...without.slice(clamped),
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < nextOrder.length; i += 1) {
      await client.query(
        `UPDATE echo_categories SET position = $1 WHERE id = $2 AND server_id = $3`,
        [i, nextOrder[i], serverId],
      );
    }
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK');
    throw new Error('applyEchoCategoryPlacement failed');
  } finally {
    client.release();
  }

  invalidateEchoPermissionCacheForServer(serverId);
  return 'ok';
}

export type DeleteEchoChannelResult = 'ok' | 'forbidden' | 'not_found';

export async function deleteEchoChannel(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  channelId: string,
): Promise<DeleteEchoChannelResult> {
  const forumAccess = await getForumPostCreatorAccess(pool, channelId);
  if (
    forumAccess &&
    forumAccess.serverId === serverId &&
    forumCreatorCanDeleteOwnPost(forumAccess, actorId)
  ) {
    const del = await pool.query(
      `DELETE FROM echo_channels WHERE id = $1 AND server_id = $2 RETURNING id`,
      [channelId, serverId],
    );
    if (del.rows.length === 0) return 'not_found';
    invalidateEchoPermissionCacheForServer(serverId);
    return 'ok';
  }

  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!actorPerms.has('MANAGE_CHANNELS') && !actorPerms.has('MANAGE_GUILD'))
    return 'forbidden';
  const del = await pool.query(
    `DELETE FROM echo_channels WHERE id = $1 AND server_id = $2 RETURNING id`,
    [channelId, serverId],
  );
  if (del.rows.length === 0) return 'not_found';
  invalidateEchoPermissionCacheForServer(serverId);
  return 'ok';
}

export type DeleteEchoCategoryResult = 'ok' | 'forbidden' | 'not_found';

export async function deleteEchoCategory(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  categoryId: string,
): Promise<DeleteEchoCategoryResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!actorPerms.has('MANAGE_CHANNELS') && !actorPerms.has('MANAGE_GUILD'))
    return 'forbidden';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cat = await client.query(
      `SELECT id FROM echo_categories WHERE id = $1 AND server_id = $2`,
      [categoryId, serverId],
    );
    if (cat.rows.length === 0) {
      await client.query('ROLLBACK');
      return 'not_found';
    }
    await client.query(
      `DELETE FROM echo_channels WHERE server_id = $1 AND category_id = $2`,
      [serverId, categoryId],
    );
    const del = await client.query(
      `DELETE FROM echo_categories WHERE id = $1 AND server_id = $2 RETURNING id`,
      [categoryId, serverId],
    );
    if (del.rows.length === 0) {
      await client.query('ROLLBACK');
      return 'not_found';
    }
    await client.query('COMMIT');
    invalidateEchoPermissionCacheForServer(serverId);
    return 'ok';
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function createEchoChannel(
  pool: pg.Pool,
  serverId: string,
  name: string,
  type: 'text' | 'voice' | 'forum' | 'stage',
  categoryId: string | null,
  iconKey?: string,
  opts?: {
    parentChannelId?: string | null;
    forumAvailableTags?: unknown;
    forumPostTagIds?: unknown;
    forumPostPinned?: boolean;
    forumPostLocked?: boolean;
    forumPostArchivedAt?: Date | null;
    forumPostCreatorUserId?: string | null;
    /** Display-only Discord VC roster mirror; CONNECT denied for @everyone. */
    discordVoiceMirrorOnly?: boolean;
  },
): Promise<string | 'invalid_category'> {
  const cid = categoryId != null ? String(categoryId).trim() : '';
  if (cid) {
    const cat = await pool.query(
      `SELECT 1 FROM echo_categories WHERE id = $1 AND server_id = $2`,
      [cid, serverId],
    );
    if (cat.rows.length === 0) return 'invalid_category';
  }
  const id = nextEchoSnowflakeId();
  const maxPos = await pool.query(
    cid
      ? `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM echo_channels WHERE server_id = $1 AND category_id = $2`
      : `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM echo_channels WHERE server_id = $1 AND category_id IS NULL`,
    cid ? [serverId, cid] : [serverId],
  );
  const pos = Number(maxPos.rows[0]?.p ?? 0);
  const ik = normalizeEchoChannelIconKeyForDb(iconKey);
  const parent =
    opts?.parentChannelId != null && String(opts.parentChannelId).trim()
      ? String(opts.parentChannelId).trim()
      : null;
  const forumTags = opts?.forumAvailableTags ?? null;
  const postTagIds = opts?.forumPostTagIds ?? null;
  const forumTagsJson = forumTags === null ? null : JSON.stringify(forumTags);
  const postTagIdsJson =
    postTagIds === null ? null : JSON.stringify(postTagIds);
  const postPinned = opts?.forumPostPinned === true;
  const postLocked = opts?.forumPostLocked === true;
  const postArchivedAt = opts?.forumPostArchivedAt ?? null;
  const postCreator =
    opts?.forumPostCreatorUserId != null &&
    String(opts.forumPostCreatorUserId).trim()
      ? String(opts.forumPostCreatorUserId).trim()
      : null;
  const channelDisplayName = clampEchoChannelName(name) || 'channel';
  const mirrorOnly = opts?.discordVoiceMirrorOnly === true;
  const resolvedIconKey =
    type === 'stage' && (ik == null || ik === '')
      ? 'discordStage'
      : ik;
  await pool.query(
    `INSERT INTO echo_channels (id, server_id, name, type, category_id, position, icon_key, parent_channel_id, forum_available_tags, forum_post_tag_ids, forum_post_pinned, forum_post_locked, forum_post_archived_at, forum_post_creator_user_id, discord_voice_mirror_only)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15)`,
    [
      id,
      serverId,
      channelDisplayName,
      type,
      cid || null,
      pos,
      resolvedIconKey,
      parent,
      forumTagsJson,
      postTagIdsJson,
      postPinned,
      postLocked,
      postArchivedAt,
      postCreator,
      mirrorOnly,
    ],
  );
  if (type === 'stage') {
    await pool.query(
      `INSERT INTO echo_channel_permission_overwrite_rows (id, server_id, channel_id, target_type, target_id, partial)
       VALUES ($1, $2, $3, 'everyone', NULL, $4::jsonb)`,
      [
        nextEchoSnowflakeId(),
        serverId,
        id,
        JSON.stringify({ CONNECT: true, SPEAK: false }),
      ],
    );
  }
  if (type === 'voice' || type === 'stage') {
    await pool.query(
      `UPDATE echo_channels SET voice_e2ee_enabled = TRUE WHERE id = $1`,
      [id],
    );
  }
  invalidateEchoPermissionCacheForServer(serverId);
  return id;
}

/** Curated keys / filenames, or https image URLs (e.g. custom emoji assets). */
const MAX_ECHO_CHANNEL_ICON_KEY_LEN = 2048;

const CHANNEL_ICON_RELATIVE_PATH_RE = /^\/[\w\-./%~?#=&]{0,2047}$/;

function isEchoStorableHttpUrlForChannelIcon(t: string): boolean {
  if (t.length < 8) return false;
  let parseInput = t;
  if (t.startsWith('//')) {
    parseInput = `https:${t}`;
  } else if (!/^https?:\/\//i.test(t)) {
    return false;
  }
  if (/[\x00-\x1f<>]/.test(t)) return false;
  try {
    const u = new URL(parseInput);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Normalize client `iconKey` before persisting (curated keys, catalog filenames, or image URLs). */
export function normalizeEchoChannelIconKeyForDb(
  raw: string | undefined,
): string {
  if (raw === undefined || raw === null) return '';
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (!t) return '';
  if (t.length > MAX_ECHO_CHANNEL_ICON_KEY_LEN) return '';
  if (isEchoStorableHttpUrlForChannelIcon(t)) return t;
  if (t.startsWith('/') && CHANNEL_ICON_RELATIVE_PATH_RE.test(t)) return t;
  if (/[\x00-\x1f\\/<>]/.test(t)) return '';
  return t;
}
