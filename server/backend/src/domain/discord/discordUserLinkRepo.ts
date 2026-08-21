import type { Pool } from 'pg';
import type { DiscordNormalizedV1 } from './discordNormalized';

export type DiscordLinkRow = {
  userId: string;
  discordUserId: string;
  accessTokenCipher: string;
  refreshTokenCipher: string | null;
  tokenExpiresAt: string | null;
  scope: string;
  discordNormalized: DiscordNormalizedV1;
  discordRawCache: Record<string, unknown> | null;
  mergeKind: 'full' | 'partial';
  mergeAppliedAt: string | null;
};

function rowToLink(r: Record<string, unknown>): DiscordLinkRow {
  const norm = r.discord_normalized_jsonb as DiscordNormalizedV1;
  return {
    userId: String(r.user_id),
    discordUserId: String(r.discord_user_id),
    accessTokenCipher: String(r.access_token_cipher),
    refreshTokenCipher:
      r.refresh_token_cipher != null ? String(r.refresh_token_cipher) : null,
    tokenExpiresAt:
      r.token_expires_at != null ? String(r.token_expires_at) : null,
    scope: String(r.scope ?? ''),
    discordNormalized: norm,
    discordRawCache:
      r.discord_raw_cache_jsonb != null
        ? (r.discord_raw_cache_jsonb as Record<string, unknown>)
        : null,
    mergeKind: r.merge_kind === 'full' ? 'full' : 'partial',
    mergeAppliedAt:
      r.merge_applied_at != null ? String(r.merge_applied_at) : null,
  };
}

/** Echo user id for this Discord account, if linked. */
export async function getUserIdByDiscordUserId(
  pool: Pool,
  discordUserId: string,
): Promise<string | null> {
  const res = await pool.query(
    `SELECT user_id FROM auth_discord_user_links WHERE discord_user_id = $1 LIMIT 1`,
    [discordUserId],
  );
  const row = res.rows[0] as { user_id?: string } | undefined;
  return row?.user_id != null ? String(row.user_id) : null;
}

export async function findDiscordLinkOwnerForDiscordUser(
  pool: Pool,
  discordUserId: string,
  excludeUserId?: string,
): Promise<string | null> {
  const q = excludeUserId
    ? `SELECT user_id FROM auth_discord_user_links WHERE discord_user_id = $1 AND user_id <> $2 LIMIT 1`
    : `SELECT user_id FROM auth_discord_user_links WHERE discord_user_id = $1 LIMIT 1`;
  const args = excludeUserId ? [discordUserId, excludeUserId] : [discordUserId];
  const res = await pool.query(q, args);
  const row = res.rows[0] as { user_id?: string } | undefined;
  return row?.user_id != null ? String(row.user_id) : null;
}

export async function getDiscordLinkByUserId(
  pool: Pool,
  userId: string,
): Promise<DiscordLinkRow | null> {
  const res = await pool.query(
    `
    SELECT user_id, discord_user_id, access_token_cipher, refresh_token_cipher, token_expires_at, scope,
           discord_normalized_jsonb, discord_raw_cache_jsonb, merge_kind, merge_applied_at
    FROM auth_discord_user_links
    WHERE user_id = $1
    `,
    [userId],
  );
  const r = res.rows[0] as Record<string, unknown> | undefined;
  return r ? rowToLink(r) : null;
}

export async function upsertDiscordUserLink(
  pool: Pool,
  input: {
    userId: string;
    discordUserId: string;
    accessTokenCipher: string;
    refreshTokenCipher: string | null;
    tokenExpiresAt: string | null;
    scope: string;
    discordNormalized: DiscordNormalizedV1;
    discordRawCache: Record<string, unknown> | null;
    mergeKind: 'full' | 'partial';
  },
): Promise<void> {
  await pool.query(
    `
    INSERT INTO auth_discord_user_links (
      user_id, discord_user_id, access_token_cipher, refresh_token_cipher, token_expires_at, scope,
      discord_normalized_jsonb, discord_raw_cache_jsonb, merge_kind, merge_applied_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      discord_user_id = EXCLUDED.discord_user_id,
      access_token_cipher = EXCLUDED.access_token_cipher,
      refresh_token_cipher = EXCLUDED.refresh_token_cipher,
      token_expires_at = EXCLUDED.token_expires_at,
      scope = EXCLUDED.scope,
      discord_normalized_jsonb = EXCLUDED.discord_normalized_jsonb,
      discord_raw_cache_jsonb = EXCLUDED.discord_raw_cache_jsonb,
      merge_kind = EXCLUDED.merge_kind,
      merge_applied_at = NOW(),
      updated_at = NOW()
    `,
    [
      input.userId,
      input.discordUserId,
      input.accessTokenCipher,
      input.refreshTokenCipher,
      input.tokenExpiresAt,
      input.scope,
      JSON.stringify(input.discordNormalized),
      input.discordRawCache ? JSON.stringify(input.discordRawCache) : null,
      input.mergeKind,
    ],
  );
}

export async function deleteDiscordUserLink(
  pool: Pool,
  userId: string,
): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM auth_discord_user_links WHERE user_id = $1`,
    [userId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function updateDiscordUserLinkTokens(
  pool: Pool,
  userId: string,
  input: {
    accessTokenCipher: string;
    refreshTokenCipher: string | null;
    tokenExpiresAt: string | null;
    scope?: string;
  },
): Promise<void> {
  if (input.scope?.trim()) {
    await pool.query(
      `
      UPDATE auth_discord_user_links
      SET access_token_cipher = $2,
          refresh_token_cipher = $3,
          token_expires_at = $4,
          scope = $5,
          updated_at = NOW()
      WHERE user_id = $1
      `,
      [
        userId,
        input.accessTokenCipher,
        input.refreshTokenCipher,
        input.tokenExpiresAt,
        input.scope.trim(),
      ],
    );
    return;
  }
  await pool.query(
    `
    UPDATE auth_discord_user_links
    SET access_token_cipher = $2,
        refresh_token_cipher = $3,
        token_expires_at = $4,
        updated_at = NOW()
    WHERE user_id = $1
    `,
    [
      userId,
      input.accessTokenCipher,
      input.refreshTokenCipher,
      input.tokenExpiresAt,
    ],
  );
}
