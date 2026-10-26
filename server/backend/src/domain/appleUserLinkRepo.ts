import type { Pool } from 'pg';

export type AppleUserLinkRow = {
  userId: string;
  appleSub: string;
  appleEmail: string | null;
  appleRefreshToken: string | null;
};

export async function getUserIdByAppleSub(
  pool: Pool,
  appleSub: string,
): Promise<string | null> {
  const res = await pool.query(
    `SELECT user_id FROM auth_apple_user_links WHERE apple_sub = $1 LIMIT 1`,
    [appleSub],
  );
  const row = res.rows[0] as { user_id?: string } | undefined;
  return row?.user_id != null ? String(row.user_id) : null;
}

export async function getAppleLinkByUserId(
  pool: Pool,
  userId: string,
): Promise<AppleUserLinkRow | null> {
  const res = await pool.query(
    `
    SELECT user_id, apple_sub, apple_email, apple_refresh_token
    FROM auth_apple_user_links
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId],
  );
  const row = res.rows[0] as
    | {
        user_id?: string;
        apple_sub?: string;
        apple_email?: string | null;
        apple_refresh_token?: string | null;
      }
    | undefined;
  if (!row?.user_id || !row.apple_sub) return null;
  return {
    userId: String(row.user_id),
    appleSub: String(row.apple_sub),
    appleEmail: row.apple_email != null ? String(row.apple_email) : null,
    appleRefreshToken:
      row.apple_refresh_token != null ? String(row.apple_refresh_token) : null,
  };
}

export async function upsertAppleUserLink(
  pool: Pool,
  input: {
    userId: string;
    appleSub: string;
    appleEmail?: string | null;
    appleRefreshToken?: string | null;
  },
): Promise<void> {
  await pool.query(
    `
    INSERT INTO auth_apple_user_links (
      user_id, apple_sub, apple_email, apple_refresh_token, updated_at
    )
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      apple_sub = EXCLUDED.apple_sub,
      apple_email = COALESCE(EXCLUDED.apple_email, auth_apple_user_links.apple_email),
      apple_refresh_token = COALESCE(
        EXCLUDED.apple_refresh_token,
        auth_apple_user_links.apple_refresh_token
      ),
      updated_at = NOW()
    `,
    [
      input.userId,
      input.appleSub,
      input.appleEmail?.trim().toLowerCase() || null,
      input.appleRefreshToken?.trim() || null,
    ],
  );
}
