import { randomInt } from 'crypto';
import type { Pool } from 'pg';
import { getPgPool } from '../../db/pg';
import { config } from '../../config';
import { nextEchoSnowflakeId } from '../../domain/echoSnowflake';
import {
  loginEmailOtpHmacHex,
  loginEmailOtpVerifyTimingSafe,
} from '../../auth/loginEmailOtpHmac';

const PURPOSE = 'new_ip_login';

/** In-memory fallback when Postgres is unavailable (dev / memory auth mode). */
const memTrusted = new Map<string, Set<string>>();
const memChallenges = new Map<
  string,
  {
    id: string;
    emailNorm: string;
    ipDigest: string;
    codeHmac: string;
    expiresAt: number;
    attemptCount: number;
    maxAttempts: number;
    createdAt: number;
  }
>();

function poolOrNull(): Pool | null {
  if (config.backendStorageMode !== 'postgres') return null;
  return getPgPool();
}

export async function isTrustedLoginIp(
  userId: string,
  ipDigest: string,
): Promise<boolean> {
  const pool = poolOrNull();
  if (!pool) {
    return memTrusted.get(userId)?.has(ipDigest) === true;
  }
  const row = await pool.query(
    `SELECT 1 FROM auth_user_trusted_login_ips WHERE user_id = $1 AND ip_digest = $2 LIMIT 1`,
    [userId, ipDigest],
  );
  return (row.rowCount ?? 0) > 0;
}

export async function trustLoginIp(
  userId: string,
  ipDigest: string,
): Promise<void> {
  const digest = String(ipDigest ?? '').trim();
  if (!digest) return;
  const pool = poolOrNull();
  if (!pool) {
    let set = memTrusted.get(userId);
    if (!set) {
      set = new Set();
      memTrusted.set(userId, set);
    }
    set.add(digest);
    return;
  }
  await pool.query(
    `
    INSERT INTO auth_user_trusted_login_ips (user_id, ip_digest, first_seen_at, last_seen_at)
    VALUES ($1, $2, NOW(), NOW())
    ON CONFLICT (user_id, ip_digest)
    DO UPDATE SET last_seen_at = NOW()
    `,
    [userId, digest],
  );
}

export async function issueLoginEmailIpOtp(input: {
  userId: string;
  emailNorm: string;
  ipDigest: string;
  enforceResendCooldown?: boolean;
}): Promise<{ plainCode: string }> {
  const emailNorm = input.emailNorm.trim().toLowerCase();
  const ipDigest = input.ipDigest.trim();
  if (!emailNorm || !ipDigest) throw new Error('INVALID_OTP_CONTEXT');

  const len = config.echoLoginEmailOtpLength;
  let plainCode = '';
  for (let i = 0; i < len; i++) plainCode += String(randomInt(0, 10));
  const codeHmac = loginEmailOtpHmacHex(
    input.userId,
    emailNorm,
    ipDigest,
    plainCode,
  );
  const ttlMs = config.echoLoginEmailOtpTtlMinutes * 60 * 1000;
  const cooldownMs = config.echoLoginEmailOtpResendCooldownSeconds * 1000;
  const maxAttempts = config.echoLoginEmailOtpMaxAttempts;
  const expiresAt = Date.now() + ttlMs;

  const pool = poolOrNull();
  if (!pool) {
    const existing = memChallenges.get(input.userId);
    if (
      input.enforceResendCooldown &&
      existing &&
      Date.now() - existing.createdAt < cooldownMs
    ) {
      throw new Error('LOGIN_EMAIL_OTP_COOLDOWN');
    }
    memChallenges.set(input.userId, {
      id: nextEchoSnowflakeId(),
      emailNorm,
      ipDigest,
      codeHmac,
      expiresAt,
      attemptCount: 0,
      maxAttempts,
      createdAt: Date.now(),
    });
    return { plainCode };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT id FROM auth_users WHERE id = $1 FOR UPDATE`, [
      input.userId,
    ]);
    if (input.enforceResendCooldown) {
      const last = await client.query(
        `
        SELECT created_at FROM auth_login_email_otp_challenges
        WHERE user_id = $1 AND purpose = $2
        ORDER BY created_at DESC LIMIT 1
        `,
        [input.userId, PURPOSE],
      );
      const cr = last.rows[0]?.created_at;
      if (cr && Date.now() - new Date(cr).getTime() < cooldownMs) {
        await client.query('ROLLBACK');
        throw new Error('LOGIN_EMAIL_OTP_COOLDOWN');
      }
    }
    await client.query(
      `
      UPDATE auth_login_email_otp_challenges
      SET invalidated_at = NOW(), invalidation_reason = 'superseded'
      WHERE user_id = $1 AND purpose = $2
        AND consumed_at IS NULL AND invalidated_at IS NULL
      `,
      [input.userId, PURPOSE],
    );
    const challengeId = nextEchoSnowflakeId();
    await client.query(
      `
      INSERT INTO auth_login_email_otp_challenges
        (id, user_id, purpose, email_norm, ip_digest, code_hmac, expires_at, max_attempts)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        challengeId,
        input.userId,
        PURPOSE,
        emailNorm,
        ipDigest,
        codeHmac,
        new Date(expiresAt).toISOString(),
        maxAttempts,
      ],
    );
    await client.query('COMMIT');
    return { plainCode };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function verifyLoginEmailIpOtp(input: {
  userId: string;
  emailNorm: string;
  ipDigest: string;
  plainCode: string;
}): Promise<boolean> {
  const digits = String(input.plainCode ?? '').replace(/\D/g, '');
  if (!digits || digits.length !== config.echoLoginEmailOtpLength) return false;
  const emailNorm = input.emailNorm.trim().toLowerCase();
  const ipDigest = input.ipDigest.trim();

  const pool = poolOrNull();
  if (!pool) {
    const ch = memChallenges.get(input.userId);
    if (!ch) return false;
    if (ch.expiresAt <= Date.now()) {
      memChallenges.delete(input.userId);
      return false;
    }
    if (ch.attemptCount >= ch.maxAttempts) return false;
    if (ch.emailNorm !== emailNorm || ch.ipDigest !== ipDigest) return false;
    const ok = loginEmailOtpVerifyTimingSafe(
      ch.codeHmac,
      input.userId,
      emailNorm,
      ipDigest,
      digits,
    );
    if (ok) {
      memChallenges.delete(input.userId);
      return true;
    }
    ch.attemptCount += 1;
    if (ch.attemptCount >= ch.maxAttempts) memChallenges.delete(input.userId);
    return false;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sel = await client.query(
      `
      SELECT id, email_norm, ip_digest, code_hmac, attempt_count, max_attempts, expires_at
      FROM auth_login_email_otp_challenges
      WHERE user_id = $1 AND purpose = $2
        AND consumed_at IS NULL AND invalidated_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
      `,
      [input.userId, PURPOSE],
    );
    const ch = sel.rows[0];
    if (!ch) {
      await client.query('ROLLBACK');
      return false;
    }
    if (new Date(ch.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE auth_login_email_otp_challenges SET invalidated_at = NOW(), invalidation_reason = 'expired' WHERE id = $1`,
        [ch.id],
      );
      await client.query('COMMIT');
      return false;
    }
    if (Number(ch.attempt_count) >= Number(ch.max_attempts)) {
      await client.query('ROLLBACK');
      return false;
    }
    if (
      String(ch.email_norm) !== emailNorm ||
      String(ch.ip_digest) !== ipDigest
    ) {
      await client.query(
        `UPDATE auth_login_email_otp_challenges SET invalidated_at = NOW(), invalidation_reason = 'context_mismatch' WHERE id = $1`,
        [ch.id],
      );
      await client.query('COMMIT');
      return false;
    }
    const ok = loginEmailOtpVerifyTimingSafe(
      String(ch.code_hmac),
      input.userId,
      emailNorm,
      ipDigest,
      digits,
    );
    if (ok) {
      await client.query(
        `UPDATE auth_login_email_otp_challenges SET consumed_at = NOW() WHERE id = $1`,
        [ch.id],
      );
      await client.query('COMMIT');
      return true;
    }
    const newAttempts = Number(ch.attempt_count) + 1;
    await client.query(
      `UPDATE auth_login_email_otp_challenges SET attempt_count = $2 WHERE id = $1`,
      [ch.id, newAttempts],
    );
    if (newAttempts >= Number(ch.max_attempts)) {
      await client.query(
        `UPDATE auth_login_email_otp_challenges SET invalidated_at = NOW(), invalidation_reason = 'max_attempts_exceeded' WHERE id = $1`,
        [ch.id],
      );
    }
    await client.query('COMMIT');
    return false;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/** @internal Test isolation. */
export function __resetLoginTrustedIpStoreForTests(): void {
  memTrusted.clear();
  memChallenges.clear();
}
