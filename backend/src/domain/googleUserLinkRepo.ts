import type { Pool } from 'pg';

export type GoogleLinkRow = {
  userId: string;
  googleSub: string;
  accessTokenCipher: string;
  refreshTokenCipher: string | null;
  tokenExpiresAt: string | null;
  scope: string;
  googleNormalized: Record<string, unknown>;
  mergeKind: 'full' | 'partial';
  mergeAppliedAt: string | null;
};

function rowToLink(r: Record<string, unknown>): GoogleLinkRow {
  return {
    userId: String(r.user_id),
    googleSub: String(r.google_sub),
    accessTokenCipher: String(r.access_token_cipher),
    refreshTokenCipher:
      r.refresh_token_cipher != null ? String(r.refresh_token_cipher) : null,
    tokenExpiresAt:
      r.token_expires_at != null ? String(r.token_expires_at) : null,
    scope: String(r.scope ?? ''),
    googleNormalized:
      (r.google_normalized_jsonb as Record<string, unknown>) ?? {},
    mergeKind: r.merge_kind === 'full' ? 'full' : 'partial',
    mergeAppliedAt:
      r.merge_applied_at != null ? String(r.merge_applied_at) : null,
  };
}

export async function findGoogleLinkOwnerForGoogleSub(
  pool: Pool,
  googleSub: string,
  excludeUserId?: string,
): Promise<string | null> {
  const q = excludeUserId
    ? `SELECT user_id FROM auth_google_user_links WHERE google_sub = $1 AND user_id <> $2 LIMIT 1`
    : `SELECT user_id FROM auth_google_user_links WHERE google_sub = $1 LIMIT 1`;
  const args = excludeUserId ? [googleSub, excludeUserId] : [googleSub];
  const res = await pool.query(q, args);
  const row = res.rows[0] as { user_id?: string } | undefined;
  return row?.user_id != null ? String(row.user_id) : null;
}

export async function getUserIdByGoogleSub(
  pool: Pool,
  googleSub: string,
): Promise<string | null> {
  const res = await pool.query(
    `SELECT user_id FROM auth_google_user_links WHERE google_sub = $1 LIMIT 1`,
    [googleSub],
  );
  const row = res.rows[0] as { user_id?: string } | undefined;
  return row?.user_id != null ? String(row.user_id) : null;
}

export async function getGoogleLinkByUserId(
  pool: Pool,
  userId: string,
): Promise<GoogleLinkRow | null> {
  const res = await pool.query(
    `
    SELECT user_id, google_sub, access_token_cipher, refresh_token_cipher, token_expires_at, scope,
           google_normalized_jsonb, merge_kind, merge_applied_at
    FROM auth_google_user_links
    WHERE user_id = $1
    `,
    [userId],
  );
  const r = res.rows[0] as Record<string, unknown> | undefined;
  return r ? rowToLink(r) : null;
}

export async function upsertGoogleUserLink(
  pool: Pool,
  input: {
    userId: string;
    googleSub: string;
    accessTokenCipher: string;
    refreshTokenCipher: string | null;
    tokenExpiresAt: string | null;
    scope: string;
    googleNormalized: Record<string, unknown>;
    mergeKind: 'full' | 'partial';
  },
): Promise<void> {
  await pool.query(
    `
    INSERT INTO auth_google_user_links (
      user_id, google_sub, access_token_cipher, refresh_token_cipher, token_expires_at, scope,
      google_normalized_jsonb, merge_kind, merge_applied_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      google_sub = EXCLUDED.google_sub,
      access_token_cipher = EXCLUDED.access_token_cipher,
      refresh_token_cipher = EXCLUDED.refresh_token_cipher,
      token_expires_at = EXCLUDED.token_expires_at,
      scope = EXCLUDED.scope,
      google_normalized_jsonb = EXCLUDED.google_normalized_jsonb,
      merge_kind = EXCLUDED.merge_kind,
      merge_applied_at = NOW(),
      updated_at = NOW()
    `,
    [
      input.userId,
      input.googleSub,
      input.accessTokenCipher,
      input.refreshTokenCipher,
      input.tokenExpiresAt,
      input.scope,
      JSON.stringify(input.googleNormalized),
      input.mergeKind,
    ],
  );
}

export async function deleteGoogleUserLink(
  pool: Pool,
  userId: string,
): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM auth_google_user_links WHERE user_id = $1`,
    [userId],
  );
  return (res.rowCount ?? 0) > 0;
}
