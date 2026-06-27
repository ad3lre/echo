import type pg from 'pg';
import {
  isCorruptedDiscordImportPfp,
  repairDiscordImportUserPfpIfNeeded,
} from '../services/discordImportAvatarMirror';

export type EchoMessageAuthorLabel = {
  name: string;
  pfp: string;
  isDiscordShadow: boolean;
  shadowDiscordUserId?: string;
  shadowAvatarMeta?: string;
  linkedDiscordUserId?: string;
};

/** Load display labels / pfps for message authors; repairs stale Discord CDN pfps in place. */
export async function loadEchoMessageAuthorLabelMap(
  pool: pg.Pool,
  authorIds: string[],
): Promise<Map<string, EchoMessageAuthorLabel>> {
  if (authorIds.length === 0) return new Map();

  const r = await pool.query(
    `
    SELECT u.id,
      COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.username), ''), 'Unknown') AS display_label,
      TRIM(u.pfp) AS pfp_trim,
      u.is_discord_shadow,
      d.discord_user_id AS shadow_discord_user_id,
      NULLIF(TRIM(d.avatar_url), '') AS shadow_avatar_url,
      l.discord_user_id AS linked_discord_user_id
    FROM auth_users u
    LEFT JOIN echo_discord_shadow_users d ON d.shadow_user_id = u.id
    LEFT JOIN auth_discord_user_links l ON l.user_id = u.id
    WHERE u.id = ANY($1::text[])
    `,
    [authorIds],
  );

  const byId = new Map<string, EchoMessageAuthorLabel>();
  for (const row of r.rows) {
    const id = String(row.id);
    const name = String(row.display_label ?? 'Unknown');
    const pfpRaw = row.pfp_trim != null ? String(row.pfp_trim) : '';
    const shadowDid =
      row.shadow_discord_user_id != null
        ? String(row.shadow_discord_user_id).trim()
        : '';
    const linkedDid =
      row.linked_discord_user_id != null
        ? String(row.linked_discord_user_id).trim()
        : '';
    const shadowAvatarMeta =
      row.shadow_avatar_url != null ? String(row.shadow_avatar_url).trim() : '';
    let pfp = pfpRaw;
    const discordUserId = shadowDid || linkedDid;
    if (discordUserId && isCorruptedDiscordImportPfp(pfp)) {
      pfp = await repairDiscordImportUserPfpIfNeeded({
        pool,
        userId: id,
        pfp,
        displayName: name,
        discordUserId,
        shadowAvatarMeta: shadowAvatarMeta || undefined,
        isShadow: row.is_discord_shadow === true,
        persist: true,
      });
    }
    byId.set(id, {
      name,
      pfp,
      isDiscordShadow: row.is_discord_shadow === true,
      ...(shadowDid ? { shadowDiscordUserId: shadowDid } : {}),
      ...(shadowAvatarMeta ? { shadowAvatarMeta } : {}),
      ...(linkedDid ? { linkedDiscordUserId: linkedDid } : {}),
    });
  }
  return byId;
}
