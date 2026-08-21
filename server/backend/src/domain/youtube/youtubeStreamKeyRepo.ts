import type { Pool } from 'pg';
import {
  decryptDiscordToken,
  encryptDiscordToken,
} from '../../auth/discordTokenCrypto';

export type YoutubeStreamKeyRow = {
  userId: string;
  updatedAt: string;
};

export async function getYoutubeStreamKeyByUserId(
  pool: Pool,
  userId: string,
): Promise<YoutubeStreamKeyRow | null> {
  const r = await pool.query(
    `SELECT user_id, updated_at FROM integration_youtube_stream_keys WHERE user_id = $1`,
    [userId],
  );
  if (!r.rows[0]) return null;
  const row = r.rows[0] as { user_id: string; updated_at: Date | string };
  return {
    userId: String(row.user_id),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

/** Returns full RTMP ingest URL (includes secret). Never log the result. */
export async function getYoutubeStreamKeyRtmpUrl(
  pool: Pool,
  userId: string,
): Promise<string | null> {
  const r = await pool.query(
    `SELECT rtmp_url_cipher FROM integration_youtube_stream_keys WHERE user_id = $1`,
    [userId],
  );
  if (!r.rows[0]) return null;
  const cipher = String(
    (r.rows[0] as { rtmp_url_cipher: string }).rtmp_url_cipher,
  );
  return decryptDiscordToken(cipher);
}

export async function upsertYoutubeStreamKey(
  pool: Pool,
  userId: string,
  rtmpUrl: string,
): Promise<void> {
  const cipher = encryptDiscordToken(rtmpUrl);
  await pool.query(
    `
    INSERT INTO integration_youtube_stream_keys (user_id, rtmp_url_cipher, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      rtmp_url_cipher = EXCLUDED.rtmp_url_cipher,
      updated_at = NOW()
    `,
    [userId, cipher],
  );
}

export async function deleteYoutubeStreamKey(
  pool: Pool,
  userId: string,
): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM integration_youtube_stream_keys WHERE user_id = $1`,
    [userId],
  );
  return (r.rowCount ?? 0) > 0;
}
