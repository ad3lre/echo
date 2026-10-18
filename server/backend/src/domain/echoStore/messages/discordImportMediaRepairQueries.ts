import type pg from 'pg';

/**
 * Messages whose payload still references Echo `discord-import-media-*` keys
 * (candidates for bot re-fetch + re-mirror when objects are missing).
 */
export async function listEchoMessagesWithDiscordImportMediaTokens(
  pool: pg.Pool,
  limit: number,
): Promise<{ id: string; channelId: string }[]> {
  const boundedLimit = Math.min(2000, Math.max(1, Math.floor(limit)));
  const { rows } = await pool.query<{ id: string; channel_id: string }>(
    `SELECT id, channel_id
     FROM echo_messages
     WHERE deleted_at IS NULL
       AND bridge_source IN ('discord_import', 'discord_inbound')
       AND (
         COALESCE(attachments::text, '') LIKE '%discord-import-media-%'
         OR COALESCE(stickers::text, '') LIKE '%discord-import-media-%'
         OR COALESCE(embeds::text, '') LIKE '%discord-import-media-%'
         OR COALESCE(image_url, '') LIKE '%discord-import-media-%'
         OR COALESCE(video_url, '') LIKE '%discord-import-media-%'
         OR COALESCE(audio_url, '') LIKE '%discord-import-media-%'
         OR COALESCE(forward_of::text, '') LIKE '%discord-import-media-%'
         OR COALESCE(reply_to::text, '') LIKE '%discord-import-media-%'
       )
     ORDER BY id DESC
     LIMIT $1`,
    [boundedLimit],
  );
  return rows.map((r) => ({ id: r.id, channelId: r.channel_id }));
}
