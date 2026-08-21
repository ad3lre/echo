import type pg from 'pg';
import { normalizePermissionOverwritePartial } from '../domain/permissions/echoPermissionPrimitives';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';

export const ECHO_VOICE_CHANNELS_CATEGORY_NAME = 'Voice Channels';
export const ECHO_TEXT_CHANNELS_CATEGORY_NAME = 'Text Channels';

export type EchoVoiceChannelMigrationRepairStats = {
  voiceCategoriesCreated: number;
  voiceChannelsRecategorized: number;
  connectDenyOverwritesRemoved: number;
  mirrorOnlyFlagsCleared: number;
};

/** True when partial is the display-only Discord mirror signature ({ CONNECT: false } only). */
export function isDiscordMirrorOnlyEveryonePartial(partial: unknown): boolean {
  const norm = normalizePermissionOverwritePartial(
    partial != null && typeof partial === 'object' && !Array.isArray(partial)
      ? (partial as Record<string, unknown>)
      : null,
  );
  if (!norm) return false;
  const keys = Object.keys(norm);
  return keys.length === 1 && norm.CONNECT === false;
}

/**
 * Idempotent data repair for legacy category + permission overwrite migrations:
 *
 * 1. Voice/stage channels stranded in the default "Text Channels" bucket (legacy
 *    `category_name` migration treated empty names as text-only).
 * 2. Erroneous @everyone CONNECT deny rows on joinable server/voice/stage channels
 *    (mirror-only signature applied outside mirror flows).
 * 3. `discord_voice_mirror_only` stuck true without mirror configuration.
 */
export async function repairEchoVoiceChannelMigrationDamage(
  pool: pg.Pool,
): Promise<EchoVoiceChannelMigrationRepairStats> {
  const stats: EchoVoiceChannelMigrationRepairStats = {
    voiceCategoriesCreated: 0,
    voiceChannelsRecategorized: 0,
    connectDenyOverwritesRemoved: 0,
    mirrorOnlyFlagsCleared: 0,
  };

  const misplaced = await pool.query(
    `
    SELECT DISTINCT ch.server_id
    FROM echo_channels ch
    INNER JOIN echo_categories cat
      ON cat.id = ch.category_id AND cat.server_id = ch.server_id
    WHERE ch.type IN ('voice', 'stage')
      AND LOWER(TRIM(cat.name)) = LOWER($1)
  `,
    [ECHO_TEXT_CHANNELS_CATEGORY_NAME],
  );

  for (const row of misplaced.rows) {
    const serverId = String(row.server_id);
    const voiceCatId = await ensureVoiceChannelsCategoryForServer(
      pool,
      serverId,
      stats,
    );
    const channels = await pool.query(
      `
      SELECT ch.id, ch.position
      FROM echo_channels ch
      INNER JOIN echo_categories cat
        ON cat.id = ch.category_id AND cat.server_id = ch.server_id
      WHERE ch.server_id = $1
        AND ch.type IN ('voice', 'stage')
        AND LOWER(TRIM(cat.name)) = LOWER($2)
      ORDER BY ch.position ASC, ch.id ASC
      `,
      [serverId, ECHO_TEXT_CHANNELS_CATEGORY_NAME],
    );
    if (channels.rows.length === 0) continue;

    const maxPosRow = await pool.query(
      `
      SELECT COALESCE(MAX(position), -1) AS mx
      FROM echo_channels
      WHERE server_id = $1 AND category_id = $2
      `,
      [serverId, voiceCatId],
    );
    let nextPos = Number(maxPosRow.rows[0]?.mx ?? -1) + 1;
    for (const ch of channels.rows) {
      await pool.query(
        `
        UPDATE echo_channels
        SET category_id = $1, position = $2
        WHERE id = $3 AND server_id = $4
        `,
        [voiceCatId, nextPos, String(ch.id), serverId],
      );
      nextPos += 1;
      stats.voiceChannelsRecategorized += 1;
    }
  }

  const stuckMirrorOnly = await pool.query(`
    UPDATE echo_channels ch
    SET discord_voice_mirror_only = false
    WHERE ch.discord_voice_mirror_only = true
      AND ch.type IN ('voice', 'stage')
      AND NOT EXISTS (
        SELECT 1 FROM echo_discord_voice_mirror_voice_channel vm
        WHERE vm.channel_id = ch.id AND vm.enabled = true
      )
      AND NOT EXISTS (
        SELECT 1 FROM echo_discord_voice_mirror_map m
        WHERE m.echo_channel_id = ch.id AND m.server_id = ch.server_id
      )
    RETURNING ch.id
  `);
  stats.mirrorOnlyFlagsCleared = stuckMirrorOnly.rowCount ?? 0;

  const badOverwrites = await pool.query(`
    SELECT ow.id, ow.server_id, ow.channel_id, ow.partial
    FROM echo_channel_permission_overwrite_rows ow
    INNER JOIN echo_channels ch
      ON ch.id = ow.channel_id AND ch.server_id = ow.server_id
    WHERE ow.target_type = 'everyone'
      AND ch.type IN ('voice', 'stage')
      AND ch.discord_voice_mirror_only = false
      AND NOT EXISTS (
        SELECT 1 FROM echo_discord_voice_mirror_voice_channel vm
        WHERE vm.channel_id = ch.id AND vm.enabled = true
      )
  `);
  for (const row of badOverwrites.rows) {
    if (!isDiscordMirrorOnlyEveryonePartial(row.partial)) continue;
    await pool.query(
      `DELETE FROM echo_channel_permission_overwrite_rows WHERE id = $1`,
      [String(row.id)],
    );
    stats.connectDenyOverwritesRemoved += 1;
  }

  return stats;
}

async function ensureVoiceChannelsCategoryForServer(
  pool: pg.Pool,
  serverId: string,
  stats: EchoVoiceChannelMigrationRepairStats,
): Promise<string> {
  const existing = await pool.query(
    `
    SELECT id FROM echo_categories
    WHERE server_id = $1 AND LOWER(TRIM(name)) = LOWER($2)
    LIMIT 1
    `,
    [serverId, ECHO_VOICE_CHANNELS_CATEGORY_NAME],
  );
  if (existing.rows.length > 0) {
    return String(existing.rows[0]!.id);
  }

  const textCat = await pool.query(
    `
    SELECT position FROM echo_categories
    WHERE server_id = $1 AND LOWER(TRIM(name)) = LOWER($2)
    LIMIT 1
    `,
    [serverId, ECHO_TEXT_CHANNELS_CATEGORY_NAME],
  );
  let position: number;
  if (textCat.rows.length > 0) {
    position = Number(textCat.rows[0]!.position ?? 0) + 1;
  } else {
    const maxRow = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM echo_categories WHERE server_id = $1`,
      [serverId],
    );
    position = Number(maxRow.rows[0]?.p ?? 0);
  }

  const catId = nextEchoSnowflakeId();
  await pool.query(
    `INSERT INTO echo_categories (id, server_id, name, position) VALUES ($1, $2, $3, $4)`,
    [catId, serverId, ECHO_VOICE_CHANNELS_CATEGORY_NAME, position],
  );
  stats.voiceCategoriesCreated += 1;
  return catId;
}
