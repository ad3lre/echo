import type pg from 'pg';
import {
  publicBadgesFromAccount,
  type EchoPublicBadgeId,
} from '../../../../shared/echoAccountBadges';
import { normalizeEchoPlanId } from '../../../../shared/echoPlanLimits';

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
    `SELECT id, username,
            COALESCE(NULLIF(TRIM(display_name), ''), '') AS display_name,
            COALESCE(pfp, '') AS pfp,
            COALESCE(is_guest, false) AS is_guest,
            COALESCE(is_discord_shadow, false) AS is_discord_shadow,
            COALESCE(NULLIF(TRIM(echo_plan), ''), 'free') AS echo_plan,
            signup_ordinal
       FROM auth_users
      WHERE id = $1
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
  const badges = publicBadgesFromAccount(
    Number.isFinite(signupOrdinal) ? signupOrdinal : null,
    {
      isGuest: row.is_guest === true,
      isDiscordShadow: row.is_discord_shadow === true,
    },
    normalizeEchoPlanId(row.echo_plan),
  );
  return {
    id: String(row.id),
    name,
    pfp: typeof row.pfp === 'string' ? row.pfp.trim() : '',
    ...(un ? { username: un } : {}),
    ...(badges.length ? { badges } : {}),
  };
}
