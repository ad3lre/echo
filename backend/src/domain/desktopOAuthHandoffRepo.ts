import { createHash, randomBytes } from 'crypto';
import type { Pool } from 'pg';
import { hashDesktopOauthHandoffNonce } from './desktopOAuthHandoffNonce';

const HANDOFF_TTL_SEC = 120;

function buildDesktopOauthHandoffCodeHash(
  code: string,
  desktopNonceHash: string,
): string {
  return createHash('sha256')
    .update(`echo_desktop_handoff_v2|${desktopNonceHash}|${code}`, 'utf8')
    .digest('hex');
}

export async function createDesktopOauthHandoff(
  pool: Pool,
  userId: string,
  desktopNonceHash: string,
): Promise<{ code: string }> {
  const code = randomBytes(32).toString('hex');
  const codeHash = buildDesktopOauthHandoffCodeHash(code, desktopNonceHash);
  const id = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_SEC * 1000).toISOString();
  await pool.query(
    `INSERT INTO auth_desktop_oauth_handoffs (id, code_hash, user_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [id, codeHash, userId, expiresAt],
  );
  return { code };
}

export async function consumeDesktopOauthHandoff(
  pool: Pool,
  code: string,
  desktopNonce: string,
): Promise<{ userId: string } | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const desktopNonceHash = hashDesktopOauthHandoffNonce(desktopNonce);
  const codeHash = buildDesktopOauthHandoffCodeHash(trimmed, desktopNonceHash);
  const res = await pool.query<{ user_id: string }>(
    `UPDATE auth_desktop_oauth_handoffs
     SET consumed_at = NOW()
     WHERE code_hash = $1
       AND consumed_at IS NULL
       AND expires_at > NOW()
     RETURNING user_id`,
    [codeHash],
  );
  const row = res.rows[0];
  if (!row) return null;
  return { userId: row.user_id };
}
