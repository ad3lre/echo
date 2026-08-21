import type pg from 'pg';
import {
  publicBadgesFromAccount,
  type EchoPublicBadgeId,
} from '../../../../../../contracts/echoAccountBadges';
import { normalizeEchoPlanId } from '../../../../../../contracts/echoPlanLimits';
import {
  needsDiscordImportPfpRepair,
  repairDiscordImportUserPfpIfNeeded,
} from '../../../services/discordImport/discordImportAvatarMirror';

/**
 * Minimal profile for typing indicators (display name + avatar URL from `auth_users`).
 */
export async function getEchoUserTypingProfile(
  pool: pg.Pool,
  userId: string,
): Promise<{ displayName: string; avatarUrl: string }> {
  const r = await pool.query(
    `SELECT username,
            COALESCE(NULLIF(TRIM(display_name), ''), '') AS display_name,
            COALESCE(pfp, '') AS pfp
       FROM auth_users
      WHERE id = $1
      LIMIT 1`,
    [userId],
  );
  const row = r.rows[0] as
    | { username: string; display_name: string; pfp: string }
    | undefined;
  if (!row) {
    return { displayName: 'Someone', avatarUrl: '' };
  }
  const dn =
    typeof row.display_name === 'string' ? row.display_name.trim() : '';
  const un = typeof row.username === 'string' ? row.username.trim() : '';
  const displayName = dn || un || 'Someone';
  const avatarUrl = typeof row.pfp === 'string' ? row.pfp.trim() : '';
  return { displayName, avatarUrl };
}

export type EchoUserPublicProfileRow = {
  id: string;
  name: string;
  pfp: string;
  username?: string;
  /** Profile badges (Echo+ / Echo Black / OG) when present. */
  badges?: EchoPublicBadgeId[];
  /** Profile bio text from `auth_users.bio`. */
  bio?: string;
  bannerImage?: string;
  bannerColor?: string;
  bannerRefractionEnabled?: boolean;
  bannerBlurEnabled?: boolean;
  bannerBlackoutEnabled?: boolean;
  /** 0–100, vertical focal point for the banner image. */
  bannerPositionY?: number;
  /** IANA timezone for Magic Time (`auth_users.time_zone`). */
  timeZone?: string | null;
};

/** Cap aligned with presence batch so home can hydrate peers in one round-trip. */
export const ECHO_PROFILE_BATCH_MAX_USER_IDS = 200;

function clampBannerPositionY(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
}

type ProfileSqlRow = {
  id: string;
  username: string;
  display_name: string;
  pfp: string;
  is_guest: boolean;
  is_discord_shadow: boolean;
  echo_plan: string;
  signup_ordinal: unknown;
  awarded_badges: string[] | null;
  bio: string;
  time_zone: string;
  banner_image: string;
  banner_color: string;
  banner_refraction_enabled: boolean;
  banner_blur_enabled: boolean;
  banner_blackout_enabled: boolean;
  banner_position_y: unknown;
  shadow_discord_user_id: string | null;
  shadow_avatar_url: string | null;
  linked_discord_user_id: string | null;
};

const PROFILE_SELECT = `SELECT u.id, u.username,
            COALESCE(NULLIF(TRIM(u.display_name), ''), '') AS display_name,
            COALESCE(u.pfp, '') AS pfp,
            COALESCE(u.is_guest, false) AS is_guest,
            COALESCE(u.is_discord_shadow, false) AS is_discord_shadow,
            COALESCE(NULLIF(TRIM(u.echo_plan), ''), 'free') AS echo_plan,
            u.signup_ordinal,
            u.awarded_badges,
            COALESCE(NULLIF(TRIM(u.bio), ''), '') AS bio,
            COALESCE(NULLIF(TRIM(u.time_zone), ''), '') AS time_zone,
            COALESCE(NULLIF(TRIM(u.banner_image), ''), '') AS banner_image,
            COALESCE(NULLIF(TRIM(u.banner_color), ''), '') AS banner_color,
            COALESCE(u.banner_refraction_enabled, false) AS banner_refraction_enabled,
            COALESCE(u.banner_blur_enabled, false) AS banner_blur_enabled,
            COALESCE(u.banner_blackout_enabled, false) AS banner_blackout_enabled,
            u.banner_position_y,
            d.discord_user_id AS shadow_discord_user_id,
            NULLIF(TRIM(d.avatar_url), '') AS shadow_avatar_url,
            l.discord_user_id AS linked_discord_user_id
       FROM auth_users u
       LEFT JOIN echo_discord_shadow_users d ON d.shadow_user_id = u.id
       LEFT JOIN auth_discord_user_links l ON l.user_id = u.id`;

async function mapProfileSqlRow(
  pool: pg.Pool,
  row: ProfileSqlRow,
): Promise<EchoUserPublicProfileRow> {
  const dn =
    typeof row.display_name === 'string' ? row.display_name.trim() : '';
  const un = typeof row.username === 'string' ? row.username.trim() : '';
  const name = dn || un || 'Someone';
  const ordRaw = row.signup_ordinal;
  const signupOrdinal =
    ordRaw != null && ordRaw !== '' ? Number(ordRaw) : Number.NaN;
  const awarded: string[] | null = Array.isArray(row.awarded_badges)
    ? row.awarded_badges
    : null;
  const badges = publicBadgesFromAccount(
    Number.isFinite(signupOrdinal) ? signupOrdinal : null,
    {
      isGuest: row.is_guest === true,
      isDiscordShadow: row.is_discord_shadow === true,
    },
    normalizeEchoPlanId(row.echo_plan),
    awarded,
  );
  let pfp = typeof row.pfp === 'string' ? row.pfp.trim() : '';
  const shadowDiscordUserId =
    row.shadow_discord_user_id != null
      ? String(row.shadow_discord_user_id).trim()
      : '';
  const linkedDiscordUserId =
    row.linked_discord_user_id != null
      ? String(row.linked_discord_user_id).trim()
      : '';
  const discordUserId = shadowDiscordUserId || linkedDiscordUserId;
  const shadowAvatarMeta =
    row.shadow_avatar_url != null ? String(row.shadow_avatar_url).trim() : '';
  if (needsDiscordImportPfpRepair(pfp, discordUserId)) {
    pfp = await repairDiscordImportUserPfpIfNeeded({
      pool,
      userId: String(row.id),
      pfp,
      displayName: name,
      discordUserId: discordUserId || undefined,
      shadowAvatarMeta: shadowAvatarMeta || undefined,
      isShadow: row.is_discord_shadow === true,
      persist: true,
    });
  }
  return {
    id: String(row.id),
    name,
    pfp,
    ...(un ? { username: un } : {}),
    ...(badges.length ? { badges } : {}),
    bio: typeof row.bio === 'string' ? row.bio.trim() : '',
    bannerImage:
      typeof row.banner_image === 'string' ? row.banner_image.trim() : '',
    bannerColor:
      typeof row.banner_color === 'string' ? row.banner_color.trim() : '',
    bannerRefractionEnabled: row.banner_refraction_enabled === true,
    bannerBlurEnabled: row.banner_blur_enabled === true,
    bannerBlackoutEnabled: row.banner_blackout_enabled === true,
    bannerPositionY: clampBannerPositionY(row.banner_position_y),
    timeZone:
      typeof row.time_zone === 'string' && row.time_zone.trim()
        ? row.time_zone.trim().slice(0, 64)
        : null,
  };
}

/** Row shape for GET `/users/:id/profile` when visibility checks pass. */
export async function getEchoUserPublicProfileRow(
  pool: pg.Pool,
  userId: string,
): Promise<EchoUserPublicProfileRow | null> {
  const id = userId.trim();
  if (!id) return null;
  const rows = await getEchoUserPublicProfileRows(pool, [id]);
  return rows[0] ?? null;
}

/** Batch form of {@link getEchoUserPublicProfileRow} for inbox hydration. */
export async function getEchoUserPublicProfileRows(
  pool: pg.Pool,
  userIds: string[],
): Promise<EchoUserPublicProfileRow[]> {
  const unique = [
    ...new Set(userIds.map((id) => id.trim()).filter(Boolean)),
  ].slice(0, ECHO_PROFILE_BATCH_MAX_USER_IDS);
  if (unique.length === 0) return [];
  const r = await pool.query(
    `${PROFILE_SELECT}
      WHERE u.id = ANY($1::text[])`,
    [unique],
  );
  const mapped = await Promise.all(
    (r.rows as ProfileSqlRow[]).map((row) => mapProfileSqlRow(pool, row)),
  );
  const byId = new Map(mapped.map((row) => [row.id, row]));
  return unique
    .map((id) => byId.get(id))
    .filter((row): row is EchoUserPublicProfileRow => !!row);
}
