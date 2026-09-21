import type pg from 'pg';

/**
 * Recover imported messages whose Discord-hosted media has not yet been queued
 * for mirroring. Queue persistence belongs to this domain storage adapter; the
 * service layer owns scheduling and processing the resulting jobs.
 */
export async function enqueueUnqueuedEchoDiscordImportMediaMirrorJobs(
  pool: pg.Pool,
  limit: number,
  maxQueueDepth: number,
): Promise<number> {
  const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const boundedDepth = Math.max(1, Math.floor(maxQueueDepth));
  const result = await pool.query(
    `WITH admission_lock AS (
       SELECT pg_advisory_xact_lock(
         hashtext('echo_discord_import_media_mirror_queue_depth')
       ) AS locked
     ), queue_depth AS (
       SELECT COUNT(*)::int AS active_count
       FROM echo_discord_import_media_mirror_queue
       CROSS JOIN admission_lock
       WHERE status IN ('pending', 'processing')
     )
     INSERT INTO echo_discord_import_media_mirror_queue
       (message_id, channel_id, actor_id)
     SELECT m.id, m.channel_id, m.author_id
     FROM echo_messages m
     CROSS JOIN queue_depth qd
     WHERE m.deleted_at IS NULL
       AND qd.active_count < $2
       AND m.bridge_source IN ('discord_import', 'discord_inbound')
       AND NOT EXISTS (
         SELECT 1
         FROM echo_discord_import_media_mirror_queue q
         WHERE q.message_id = m.id
       )
       AND (
         COALESCE(m.image_url, '') LIKE '%discordapp.com%'
         OR COALESCE(m.image_url, '') LIKE '%discordapp.net%'
         OR COALESCE(m.video_url, '') LIKE '%discordapp.com%'
         OR COALESCE(m.video_url, '') LIKE '%discordapp.net%'
         OR COALESCE(m.audio_url, '') LIKE '%discordapp.com%'
         OR COALESCE(m.audio_url, '') LIKE '%discordapp.net%'
         OR COALESCE(m.attachments::text, '') LIKE '%discordapp.com%'
         OR COALESCE(m.attachments::text, '') LIKE '%discordapp.net%'
         OR COALESCE(m.stickers::text, '') LIKE '%discordapp.com%'
         OR COALESCE(m.stickers::text, '') LIKE '%discordapp.net%'
         OR COALESCE(m.embeds::text, '') LIKE '%discordapp.com%'
         OR COALESCE(m.embeds::text, '') LIKE '%discordapp.net%'
         OR COALESCE(m.forward_of::text, '') LIKE '%discordapp.com%'
         OR COALESCE(m.forward_of::text, '') LIKE '%discordapp.net%'
         OR COALESCE(m.reply_to::text, '') LIKE '%discordapp.com%'
         OR COALESCE(m.reply_to::text, '') LIKE '%discordapp.net%'
       )
     ORDER BY m.id ASC
    LIMIT $1
    ON CONFLICT (message_id) DO NOTHING`,
    [boundedLimit, boundedDepth],
  );
  return result.rowCount ?? 0;
}
