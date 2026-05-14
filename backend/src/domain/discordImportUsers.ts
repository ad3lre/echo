import type { Pool } from 'pg';
import { resolveDiscordAvatarForStorage } from './discordNormalized';
import { nextEchoSnowflakeId } from './echoSnowflake';
import { addEchoServerMember } from './echoStore/servers';

/** Minimal Discord user payload (message author or guild member `user`). */
export type DiscordAuthorLike = {
  id: string | number;
  username?: string;
  global_name?: string;
  globalName?: string;
  avatar?: string | null;
  /**
   * Guild nickname from `members.jsonl` (`nick`). When this key is present (including `null`),
   * shadow display names are refreshed from member import. Omit for message import so we do not
   * overwrite a guild nick with author-only fields.
   */
  guildNick?: string | null;
};

function hasGuildMemberNickField(author: DiscordAuthorLike): boolean {
  return Object.prototype.hasOwnProperty.call(author, 'guildNick');
}

/** Display name for Discord-imported shadow users (nick beats global name beats username). */
export function resolveDiscordShadowDisplayName(
  author: DiscordAuthorLike,
): string {
  const g = author.guildNick;
  if (typeof g === 'string' && g.trim()) return g.trim();
  const globalA =
    typeof author.global_name === 'string' && author.global_name.trim()
      ? author.global_name.trim()
      : '';
  const globalB =
    typeof author.globalName === 'string' && author.globalName.trim()
      ? author.globalName.trim()
      : '';
  const uname =
    typeof author.username === 'string' && author.username.trim()
      ? author.username.trim()
      : '';
  return globalA || globalB || uname || 'user';
}

/**
 * Records Discord user id → Echo user id for this server's import bundle.
 * Used for diagnostics and kept in sync when message import resolves authors.
 * No-op if the server has no import state row.
 */
export async function mergeDiscordImportUserMap(
  pool: Pool,
  serverId: string,
  discordUserId: string,
  echoUserId: string,
): Promise<void> {
  const d = discordUserId.trim();
  const e = echoUserId.trim();
  if (!d || !e) return;
  await pool.query(
    `
    UPDATE echo_discord_import_states
    SET discord_to_echo_user_map =
      COALESCE(discord_to_echo_user_map, '{}'::jsonb) || jsonb_build_object($2::text, $3::text),
        updated_at = NOW()
    WHERE server_id = $1
    `,
    [serverId, d, e],
  );
}

/**
 * Merge many entries into `discord_to_echo_user_map` in one statement.
 */
export async function mergeDiscordImportUserMapBatch(
  pool: Pool,
  serverId: string,
  entries: Record<string, string>,
): Promise<void> {
  const keys = Object.keys(entries);
  if (keys.length === 0) return;
  await pool.query(
    `
    UPDATE echo_discord_import_states
    SET discord_to_echo_user_map =
      COALESCE(discord_to_echo_user_map, '{}'::jsonb) || $2::jsonb,
        updated_at = NOW()
    WHERE server_id = $1
    `,
    [serverId, JSON.stringify(entries)],
  );
}

/**
 * Resolve or create the Echo user for a Discord account in this imported server context:
 * linked canonical user, existing shadow, or new shadow. Ensures server membership.
 * Updates the import user map when an import state row exists.
 */
export async function ensureEchoUserForDiscordMember(
  pool: Pool,
  serverId: string,
  author: DiscordAuthorLike,
  options?: { recordInImportMap?: boolean },
): Promise<string> {
  const recordMap = options?.recordInImportMap !== false;
  const discordUserId = String(author.id);

  const existingLink = await pool.query(
    `SELECT user_id FROM auth_discord_user_links WHERE discord_user_id = $1`,
    [discordUserId],
  );
  if (existingLink.rows.length > 0) {
    const canonicalId = String(existingLink.rows[0].user_id);
    await addEchoServerMember(pool, serverId, canonicalId);
    if (recordMap) {
      await mergeDiscordImportUserMap(
        pool,
        serverId,
        discordUserId,
        canonicalId,
      );
    }
    return canonicalId;
  }

  const existingShadow = await pool.query<{
    shadow_user_id: string;
    pfp: string | null;
  }>(
    `
    SELECT s.shadow_user_id, u.pfp
    FROM echo_discord_shadow_users s
    INNER JOIN auth_users u ON u.id = s.shadow_user_id
    WHERE s.discord_user_id = $1 AND s.source_server_id = $2
    `,
    [discordUserId, serverId],
  );
  if (existingShadow.rows.length > 0) {
    const sid = String(existingShadow.rows[0].shadow_user_id);
    const storedPfp =
      existingShadow.rows[0].pfp != null
        ? String(existingShadow.rows[0].pfp).trim()
        : '';
    const resolvedPfp = resolveDiscordAvatarForStorage(
      discordUserId,
      author.avatar,
    );
    const storedLooksLikeUrl = /^https?:\/\//i.test(storedPfp);
    if (resolvedPfp && !storedLooksLikeUrl) {
      await pool.query(`UPDATE auth_users SET pfp = $2 WHERE id = $1`, [
        sid,
        resolvedPfp,
      ]);
      await pool.query(
        `UPDATE echo_discord_shadow_users SET avatar_url = $2 WHERE shadow_user_id = $1`,
        [sid, resolvedPfp],
      );
    }
    if (hasGuildMemberNickField(author)) {
      const dn = resolveDiscordShadowDisplayName(author);
      await pool.query(
        `UPDATE auth_users SET display_name = $2 WHERE id = $1 AND is_discord_shadow = true`,
        [sid, dn],
      );
      await pool.query(
        `UPDATE echo_discord_shadow_users SET display_name = $2 WHERE shadow_user_id = $1`,
        [sid, dn],
      );
    }
    if (recordMap) {
      await mergeDiscordImportUserMap(pool, serverId, discordUserId, sid);
    }
    await addEchoServerMember(pool, serverId, sid);
    return sid;
  }

  const authUserId = nextEchoSnowflakeId();
  const uname =
    typeof author.username === 'string' && author.username.trim()
      ? author.username.trim()
      : 'user';
  const displayNameRaw = resolveDiscordShadowDisplayName(author);
  const pfp = resolveDiscordAvatarForStorage(discordUserId, author.avatar);
  /**
   * `auth_users.username` is UNIQUE globally. Do not derive it from Discord handle +
   * a short id suffix: many snowflakes share the same last 4 digits, and the same
   * Discord account shadowed on two Echo servers would otherwise reuse one username.
   */
  const username = `dsh_${authUserId}`;

  await pool.query(
    `INSERT INTO auth_users (id, username, display_name, pfp, password_hash, is_discord_shadow)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      authUserId,
      username,
      displayNameRaw,
      pfp,
      `DISABLED_SHADOW_${Math.random().toString(36)}`,
      true,
    ],
  );

  await pool.query(
    `INSERT INTO echo_discord_shadow_users (shadow_user_id, discord_user_id, source_server_id, username, display_name, avatar_url)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [authUserId, discordUserId, serverId, uname, displayNameRaw, pfp],
  );

  await addEchoServerMember(pool, serverId, authUserId);

  if (recordMap) {
    await mergeDiscordImportUserMap(pool, serverId, discordUserId, authUserId);
  }
  return authUserId;
}
