import type { Pool } from 'pg';

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

export async function upsertAppleUserLink(
  pool: Pool,
  input: {
    userId: string;
    appleSub: string;
    appleEmail?: string | null;
  },
): Promise<void> {
  await pool.query(
    `
    INSERT INTO auth_apple_user_links (user_id, apple_sub, apple_email, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      apple_sub = EXCLUDED.apple_sub,
      apple_email = COALESCE(EXCLUDED.apple_email, auth_apple_user_links.apple_email),
      updated_at = NOW()
    `,
    [
      input.userId,
      input.appleSub,
      input.appleEmail?.trim().toLowerCase() || null,
    ],
  );
}
