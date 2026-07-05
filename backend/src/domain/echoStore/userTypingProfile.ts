import type pg from 'pg';
import {
  publicBadgesFromAccount,
  type EchoPublicBadgeId,
} from '../../../../shared/echoAccountBadges';
import { normalizeEchoPlanId } from '../../../../shared/echoPlanLimits';
import {
  needsDiscordImportPfpRepair,
  repairDiscordImportUserPfpIfNeeded,
} from '../../services/discordImportAvatarMirror';

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
};

/** Row shape for GET `/users/:id/profile` when visibility checks pass. */
export async function getEchoUserPublicProfileRow(
  pool: pg.Pool,
  userId: string,
): Promise<EchoUserPublicProfileRow | null> {
  const id = userId.trim();
  if (!id) return null;
  const r = await pool.query(
    `SELECT u.id, u.username,
            COALESCE(NULLIF(TRIM(u.display_name), ''), '') AS display_name,
            COALESCE(u.pfp, '') AS pfp,
            COALESCE(u.is_guest, false) AS is_guest,
            COALESCE(u.is_discord_shadow, false) AS is_discord_shadow,
            COALESCE(NULLIF(TRIM(u.echo_plan), ''), 'free') AS echo_plan,
            u.signup_ordinal,
            u.awarded_badges,
            d.discord_user_id AS shadow_discord_user_id,
            NULLIF(TRIM(d.avatar_url), '') AS shadow_avatar_url,
            l.discord_user_id AS linked_discord_user_id
       FROM auth_users u
       LEFT JOIN echo_discord_shadow_users d ON d.shadow_user_id = u.id
       LEFT JOIN auth_discord_user_links l ON l.user_id = u.id
      WHERE u.id = $1
      LIMIT 1`,
    [id],
  );
  const row = r.rows[0] as
    | {
        id: string;
        username: string;
        display_name: string;
        pfp: string;
        is_guest: boolean;
        is_discord_shadow: boolean;
        echo_plan: string;
        signup_ordinal: unknown;
        awarded_badges: string[] | null;
        shadow_discord_user_id: string | null;
        shadow_avatar_url: string | null;
        linked_discord_user_id: string | null;
      }
    | undefined;
  if (!row) return null;
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
  };
}
