import type { Pool } from 'pg';

/**
 * OAuth-linked integrations (YouTube live, etc.) — separate from auth_* login links.
 */
export async function ensureIntegrationTables(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS integration_youtube_channel_links (
      user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
      youtube_channel_id TEXT NOT NULL,
      access_token_cipher TEXT NOT NULL,
      refresh_token_cipher TEXT NULL,
      token_expires_at TIMESTAMPTZ NULL,
      scope TEXT NOT NULL DEFAULT '',
      channel_title TEXT NOT NULL DEFAULT '',
      channel_thumbnail_url TEXT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS integration_youtube_channel_links_channel_id_idx
    ON integration_youtube_channel_links (youtube_channel_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_stage_youtube_broadcasts (
      server_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      started_by_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      youtube_link_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      youtube_broadcast_id TEXT NOT NULL,
      youtube_stream_id TEXT NOT NULL,
      livekit_egress_id TEXT NULL,
      status TEXT NOT NULL DEFAULT 'starting',
      privacy_status TEXT NOT NULL DEFAULT 'unlisted',
      title TEXT NOT NULL DEFAULT '',
      watch_url TEXT NULL,
      error_code TEXT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (server_id, channel_id),
      CONSTRAINT echo_stage_youtube_broadcasts_status_chk CHECK (
        status IN ('starting', 'live', 'stopping', 'ended', 'failed')
      ),
      CONSTRAINT echo_stage_youtube_broadcasts_privacy_chk CHECK (
        privacy_status IN ('public', 'unlisted', 'private')
      )
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_stage_youtube_broadcasts_status_idx
    ON echo_stage_youtube_broadcasts (status)
    WHERE status IN ('starting', 'live', 'stopping');
  `);
}
