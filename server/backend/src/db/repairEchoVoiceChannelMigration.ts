import type pg from 'pg';
import { normalizePermissionOverwritePartial } from '../domain/permissions/echoPermissionPrimitives';

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
 * Repair mirror flags and overwrites. Category names cannot establish migration
 * provenance: preserve user placement, including mixed "Text Channels" buckets.
 * Legacy category_name defaults are handled by migrateEchoCategorySchema while
 * the original column is still present.
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
