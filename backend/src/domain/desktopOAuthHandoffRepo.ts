import { randomBytes, scryptSync } from 'crypto';
import type { Pool } from 'pg';
import { hashDesktopOauthHandoffNonce } from './desktopOAuthHandoffNonce';

const HANDOFF_TTL_SEC = 300;
const HANDOFF_CODE_SCRYPT_SALT = 'echo-desktop-handoff-code-v3';

/**
 * One-time OAuth handoff code digest (not user password storage). scrypt with
 * N=2^14 matches other Echo domain-separated derivations.
 */
function buildDesktopOauthHandoffCodeHash(
  code: string,
  desktopNonceHash: string,
): string {
  return scryptSync(
    `echo_desktop_handoff_v3|${desktopNonceHash}|${code}`,
    HANDOFF_CODE_SCRYPT_SALT,
    32,
    { N: 16384, r: 8, p: 1 },
  ).toString('hex');
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
