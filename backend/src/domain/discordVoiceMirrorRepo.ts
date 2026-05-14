import type pg from 'pg';
import { nextEchoSnowflakeId } from './echoSnowflake';
import { invalidateEchoPermissionCacheForServer } from './echoPermissionCache';

export type DiscordVoiceMirrorCategoryRow = {
  serverId: string;
  categoryId: string;
  enabled: boolean;
  discordCategoryId: string | null;
};

export type DiscordVoiceMirrorVoiceChannelRow = {
  channelId: string;
  serverId: string;
  enabled: boolean;
};

export type DiscordVoiceMirrorMapRow = {
  serverId: string;
  discordChannelId: string;
  echoChannelId: string;
  spawned: boolean;
};

export type DiscordVoiceRosterMember = {
  discordUserId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
};

/** Guild ids that have any voice mirror feature enabled (for Discord bot polling). */
export async function listDiscordVoiceMirrorWatchGuildIds(
  pool: pg.Pool,
): Promise<string[]> {
  const r = await pool.query(
    `
    SELECT DISTINCT TRIM(s.discord_guild_id::text) AS gid
    FROM echo_discord_import_states s
    WHERE s.discord_guild_id IS NOT NULL
      AND TRIM(s.discord_guild_id::text) <> ''
      AND (
        EXISTS (
          SELECT 1 FROM echo_discord_voice_mirror_category c
          WHERE c.server_id = s.server_id AND c.enabled = true
        )
        OR EXISTS (
          SELECT 1 FROM echo_discord_voice_mirror_voice_channel v
          WHERE v.server_id = s.server_id AND v.enabled = true
        )
      )
    `,
  );
  const out: string[] = [];
  for (const row of r.rows) {
    const g = String((row as { gid?: unknown }).gid ?? '').trim();
    if (g) out.push(g);
  }
  return out;
}

export async function resolveServerIdForDiscordGuild(
  pool: pg.Pool,
  discordGuildId: string,
): Promise<string | null> {
  const r = await pool.query(
    `
    SELECT server_id FROM echo_discord_import_states
    WHERE discord_guild_id = $1 AND channels_imported_at IS NOT NULL
    LIMIT 1
    `,
    [discordGuildId.trim()],
  );
  if (!r.rows.length) return null;
  return (
    String((r.rows[0] as { server_id: unknown }).server_id ?? '').trim() || null
  );
}

export async function getDiscordVoiceMirrorCategory(
  pool: pg.Pool,
  serverId: string,
  categoryId: string,
): Promise<DiscordVoiceMirrorCategoryRow | null> {
  const r = await pool.query(
    `
    SELECT server_id, category_id, enabled,
           NULLIF(TRIM(discord_category_id::text), '') AS discord_category_id
    FROM echo_discord_voice_mirror_category
    WHERE server_id = $1 AND category_id = $2
    `,
    [serverId, categoryId],
  );
  if (!r.rows.length) return null;
  const row = r.rows[0] as Record<string, unknown>;
  return {
    serverId: String(row.server_id),
    categoryId: String(row.category_id),
    enabled: row.enabled === true,
    discordCategoryId:
      row.discord_category_id != null ? String(row.discord_category_id) : null,
  };
}

export async function upsertDiscordVoiceMirrorCategory(
  pool: pg.Pool,
  input: {
    serverId: string;
    categoryId: string;
    enabled: boolean;
    discordCategoryId: string | null;
  },
): Promise<void> {
  await pool.query(
    `
    INSERT INTO echo_discord_voice_mirror_category (
      server_id, category_id, enabled, discord_category_id, updated_at
    )
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (server_id, category_id) DO UPDATE SET
      enabled = EXCLUDED.enabled,
      discord_category_id = EXCLUDED.discord_category_id,
      updated_at = NOW()
    `,
    [
      input.serverId,
      input.categoryId,
      input.enabled,
      input.discordCategoryId?.trim() || null,
    ],
  );
}

export async function getDiscordVoiceMirrorVoiceChannel(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
): Promise<DiscordVoiceMirrorVoiceChannelRow | null> {
  const r = await pool.query(
    `
    SELECT channel_id, server_id, enabled
    FROM echo_discord_voice_mirror_voice_channel
    WHERE server_id = $1 AND channel_id = $2
    `,
    [serverId, channelId],
  );
  if (!r.rows.length) return null;
  const row = r.rows[0] as Record<string, unknown>;
  return {
    channelId: String(row.channel_id),
    serverId: String(row.server_id),
    enabled: row.enabled === true,
  };
}

export async function upsertDiscordVoiceMirrorVoiceChannel(
  pool: pg.Pool,
  input: { serverId: string; channelId: string; enabled: boolean },
): Promise<void> {
  await pool.query(
    `
    INSERT INTO echo_discord_voice_mirror_voice_channel (
      channel_id, server_id, enabled, updated_at
    )
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (channel_id) DO UPDATE SET
      enabled = EXCLUDED.enabled,
      updated_at = NOW()
    `,
    [input.channelId, input.serverId, input.enabled],
  );
}

export async function deleteDiscordVoiceMirrorVoiceChannelRow(
  pool: pg.Pool,
  channelId: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM echo_discord_voice_mirror_voice_channel WHERE channel_id = $1`,
    [channelId],
  );
}

/** Import map: discord snowflake -> echo channel id */
export async function getDiscordImportChannelMap(
  pool: pg.Pool,
  serverId: string,
): Promise<Record<string, string>> {
  const r = await pool.query(
    `SELECT channel_id_map FROM echo_discord_import_states WHERE server_id = $1 LIMIT 1`,
    [serverId],
  );
  if (!r.rows.length) return {};
  const raw = (r.rows[0] as { channel_id_map?: unknown }).channel_id_map;
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k.trim()] = v.trim();
  }
  return out;
}

export async function getEchoChannelCategoryAndType(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
): Promise<{ categoryId: string | null; type: string } | null> {
  const r = await pool.query(
    `
    SELECT category_id, type FROM echo_channels
    WHERE id = $1 AND server_id = $2 LIMIT 1
    `,
    [channelId, serverId],
  );
  if (!r.rows.length) return null;
  const row = r.rows[0] as { category_id?: unknown; type?: unknown };
  const cid =
    row.category_id != null && String(row.category_id).trim()
      ? String(row.category_id)
      : null;
  return { categoryId: cid, type: String(row.type ?? '').toLowerCase() };
}

export async function listEnabledMirrorCategoriesForServer(
  pool: pg.Pool,
  serverId: string,
): Promise<DiscordVoiceMirrorCategoryRow[]> {
  const r = await pool.query(
    `
    SELECT m.server_id, m.category_id, m.enabled,
           NULLIF(TRIM(m.discord_category_id::text), '') AS discord_category_id
    FROM echo_discord_voice_mirror_category m
    JOIN echo_categories cat ON cat.id = m.category_id AND cat.server_id = m.server_id
    WHERE m.server_id = $1 AND m.enabled = true
    ORDER BY cat.position ASC, m.category_id ASC
    `,
    [serverId],
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    serverId: String(row.server_id),
    categoryId: String(row.category_id),
    enabled: true,
    discordCategoryId:
      row.discord_category_id != null ? String(row.discord_category_id) : null,
  }));
}

export async function getMirrorMapByDiscordChannel(
  pool: pg.Pool,
  serverId: string,
  discordChannelId: string,
): Promise<DiscordVoiceMirrorMapRow | null> {
  const r = await pool.query(
    `
    SELECT server_id, discord_channel_id, echo_channel_id, spawned
    FROM echo_discord_voice_mirror_map
    WHERE server_id = $1 AND discord_channel_id = $2
    LIMIT 1
    `,
    [serverId, discordChannelId],
  );
  if (!r.rows.length) return null;
  const row = r.rows[0] as Record<string, unknown>;
  return {
    serverId: String(row.server_id),
    discordChannelId: String(row.discord_channel_id),
    echoChannelId: String(row.echo_channel_id),
    spawned: row.spawned === true,
  };
}

export async function upsertMirrorMap(
  pool: pg.Pool,
  input: {
    serverId: string;
    discordChannelId: string;
    echoChannelId: string;
    spawned: boolean;
  },
): Promise<void> {
  await pool.query(
    `
    INSERT INTO echo_discord_voice_mirror_map (
      server_id, discord_channel_id, echo_channel_id, spawned, updated_at
    )
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (server_id, discord_channel_id) DO UPDATE SET
      echo_channel_id = EXCLUDED.echo_channel_id,
      spawned = EXCLUDED.spawned,
      updated_at = NOW()
    `,
    [
      input.serverId,
      input.discordChannelId,
      input.echoChannelId,
      input.spawned,
    ],
  );
}

export async function deleteMirrorMap(
  pool: pg.Pool,
  serverId: string,
  discordChannelId: string,
): Promise<void> {
  await pool.query(
    `
    DELETE FROM echo_discord_voice_mirror_map
    WHERE server_id = $1 AND discord_channel_id = $2
    `,
    [serverId, discordChannelId],
  );
}

export async function replaceRosterForDiscordChannel(
  pool: pg.Pool,
  serverId: string,
  discordChannelId: string,
  members: DiscordVoiceRosterMember[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
      DELETE FROM echo_discord_voice_roster
      WHERE server_id = $1 AND discord_channel_id = $2
      `,
      [serverId, discordChannelId],
    );
    for (const m of members) {
      await client.query(
        `
        INSERT INTO echo_discord_voice_roster (
          server_id, discord_channel_id, discord_user_id, username, global_name, avatar, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `,
        [
          serverId,
          discordChannelId,
          m.discordUserId,
          m.username,
          m.globalName,
          m.avatar,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function listFullRosterForServer(
  pool: pg.Pool,
  serverId: string,
): Promise<
  {
    discordChannelId: string;
    echoChannelId: string | null;
    members: DiscordVoiceRosterMember[];
  }[]
> {
  const mapR = await pool.query(
    `
    SELECT discord_channel_id, echo_channel_id
    FROM echo_discord_voice_mirror_map
    WHERE server_id = $1
    `,
    [serverId],
  );
  const discordToEcho = new Map<string, string>();
  for (const row of mapR.rows) {
    const rec = row as {
      discord_channel_id?: unknown;
      echo_channel_id?: unknown;
    };
    discordToEcho.set(
      String(rec.discord_channel_id ?? ''),
      String(rec.echo_channel_id ?? ''),
    );
  }

  const rosterR = await pool.query(
    `
    SELECT discord_channel_id, discord_user_id, username, global_name, avatar
    FROM echo_discord_voice_roster
    WHERE server_id = $1
    ORDER BY discord_channel_id ASC, username ASC
    `,
    [serverId],
  );

  const byDc = new Map<string, DiscordVoiceRosterMember[]>();
  for (const row of rosterR.rows) {
    const rec = row as Record<string, unknown>;
    const dc = String(rec.discord_channel_id ?? '');
    const mem: DiscordVoiceRosterMember = {
      discordUserId: String(rec.discord_user_id ?? ''),
      username: String(rec.username ?? ''),
      globalName: rec.global_name != null ? String(rec.global_name) : null,
      avatar: rec.avatar != null ? String(rec.avatar) : null,
    };
    if (!byDc.has(dc)) byDc.set(dc, []);
    byDc.get(dc)!.push(mem);
  }

  const result: {
    discordChannelId: string;
    echoChannelId: string | null;
    members: DiscordVoiceRosterMember[];
  }[] = [];

  for (const [dc, echoId] of discordToEcho) {
    result.push({
      discordChannelId: dc,
      echoChannelId: echoId || null,
      members: byDc.get(dc) ?? [],
    });
  }
  return result;
}

/** Apply CONNECT=false for @everyone on mirror-only channels (internal). */
export async function applyMirrorVoiceDenyConnect(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
): Promise<void> {
  const id = nextEchoSnowflakeId();
  await pool.query(
    `DELETE FROM echo_channel_permission_overwrite_rows WHERE server_id = $1 AND channel_id = $2`,
    [serverId, channelId],
  );
  await pool.query(
    `
    INSERT INTO echo_channel_permission_overwrite_rows (
      id, server_id, channel_id, target_type, target_id, partial
    )
    VALUES ($1, $2, $3, 'everyone', NULL, $4::jsonb)
    `,
    [id, serverId, channelId, JSON.stringify({ CONNECT: false })],
  );
  await pool.query(
    `UPDATE echo_channels SET permission_overrides = NULL WHERE id = $1 AND server_id = $2`,
    [channelId, serverId],
  );
  invalidateEchoPermissionCacheForServer(serverId);
}

export async function systemDeleteEchoChannel(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
): Promise<boolean> {
  const del = await pool.query(
    `DELETE FROM echo_channels WHERE id = $1 AND server_id = $2 RETURNING id`,
    [channelId, serverId],
  );
  if (del.rows.length === 0) return false;
  invalidateEchoPermissionCacheForServer(serverId);
  return true;
}
