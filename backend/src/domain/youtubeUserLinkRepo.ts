import type { Pool } from 'pg';

export type YoutubeChannelLinkRow = {
  userId: string;
  youtubeChannelId: string;
  accessTokenCipher: string;
  refreshTokenCipher: string | null;
  tokenExpiresAt: string | null;
  scope: string;
  channelTitle: string;
  channelThumbnailUrl: string | null;
  updatedAt: string;
};

function rowFromDb(r: Record<string, unknown>): YoutubeChannelLinkRow {
  return {
    userId: String(r.user_id),
    youtubeChannelId: String(r.youtube_channel_id),
    accessTokenCipher: String(r.access_token_cipher),
    refreshTokenCipher:
      r.refresh_token_cipher != null ? String(r.refresh_token_cipher) : null,
    tokenExpiresAt:
      r.token_expires_at != null ? String(r.token_expires_at) : null,
    scope: String(r.scope ?? ''),
    channelTitle: String(r.channel_title ?? ''),
    channelThumbnailUrl:
      r.channel_thumbnail_url != null ? String(r.channel_thumbnail_url) : null,
    updatedAt: String(r.updated_at),
  };
}

export async function getYoutubeLinkByUserId(
  pool: Pool,
  userId: string,
): Promise<YoutubeChannelLinkRow | null> {
  const r = await pool.query(
    `SELECT * FROM integration_youtube_channel_links WHERE user_id = $1`,
    [userId],
  );
  if (!r.rows[0]) return null;
  return rowFromDb(r.rows[0] as Record<string, unknown>);
}

export async function findYoutubeLinkOwnerForChannelId(
  pool: Pool,
  youtubeChannelId: string,
  exceptUserId?: string,
): Promise<string | null> {
  const r = await pool.query(
    `
    SELECT user_id FROM integration_youtube_channel_links
    WHERE youtube_channel_id = $1
      AND ($2::text IS NULL OR user_id <> $2)
    LIMIT 1
    `,
    [youtubeChannelId, exceptUserId ?? null],
  );
  return r.rows[0] ? String((r.rows[0] as { user_id: string }).user_id) : null;
}

export async function upsertYoutubeChannelLink(
  pool: Pool,
  input: {
    userId: string;
    youtubeChannelId: string;
    accessTokenCipher: string;
    refreshTokenCipher: string | null;
    tokenExpiresAt: string | null;
    scope: string;
    channelTitle: string;
    channelThumbnailUrl: string | null;
  },
): Promise<void> {
  await pool.query(
    `
    INSERT INTO integration_youtube_channel_links (
      user_id, youtube_channel_id, access_token_cipher, refresh_token_cipher,
      token_expires_at, scope, channel_title, channel_thumbnail_url, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      youtube_channel_id = EXCLUDED.youtube_channel_id,
      access_token_cipher = EXCLUDED.access_token_cipher,
      refresh_token_cipher = EXCLUDED.refresh_token_cipher,
      token_expires_at = EXCLUDED.token_expires_at,
      scope = EXCLUDED.scope,
      channel_title = EXCLUDED.channel_title,
      channel_thumbnail_url = EXCLUDED.channel_thumbnail_url,
      updated_at = NOW()
    `,
    [
      input.userId,
      input.youtubeChannelId,
      input.accessTokenCipher,
      input.refreshTokenCipher,
      input.tokenExpiresAt,
      input.scope,
      input.channelTitle,
      input.channelThumbnailUrl,
    ],
  );
}

export async function updateYoutubeChannelLinkTokens(
  pool: Pool,
  userId: string,
  input: {
    accessTokenCipher: string;
    refreshTokenCipher: string | null;
    tokenExpiresAt: string | null;
    scope?: string;
  },
): Promise<void> {
  await pool.query(
    `
    UPDATE integration_youtube_channel_links SET
      access_token_cipher = $2,
      refresh_token_cipher = $3,
      token_expires_at = $4,
      scope = COALESCE($5, scope),
      updated_at = NOW()
    WHERE user_id = $1
    `,
    [
      userId,
      input.accessTokenCipher,
      input.refreshTokenCipher,
      input.tokenExpiresAt,
      input.scope ?? null,
    ],
  );
}

export async function deleteYoutubeChannelLink(
  pool: Pool,
  userId: string,
): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM integration_youtube_channel_links WHERE user_id = $1`,
    [userId],
  );
  return (r.rowCount ?? 0) > 0;
}
