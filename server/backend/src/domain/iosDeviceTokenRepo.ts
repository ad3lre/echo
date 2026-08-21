import { randomUUID } from 'crypto';
import type pg from 'pg';

export type IosDeviceTokenRow = {
  id: string;
  userId: string;
  deviceToken: string;
  bundleId: string;
  environment: 'development' | 'production';
};

function mapRow(row: Record<string, unknown>): IosDeviceTokenRow {
  const env = row.environment === 'production' ? 'production' : 'development';
  return {
    id: String(row.id),
    userId: String(row.user_id),
    deviceToken: String(row.device_token),
    bundleId: String(row.bundle_id),
    environment: env,
  };
}

export async function upsertIosDeviceToken(
  pool: pg.Pool,
  input: {
    userId: string;
    deviceToken: string;
    bundleId?: string;
    environment?: 'development' | 'production';
    userAgent?: string;
  },
): Promise<'ok' | 'invalid'> {
  const token = input.deviceToken.trim().toLowerCase();
  if (!/^[0-9a-f]{16,}$/.test(token)) return 'invalid';
  const bundleId = (input.bundleId ?? 'com.echo.ios').trim() || 'com.echo.ios';
  const environment =
    input.environment === 'production' ? 'production' : 'development';
  await pool.query(
    `
    INSERT INTO auth_ios_device_tokens (
      id, user_id, device_token, bundle_id, environment, user_agent, created_at, last_used_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    ON CONFLICT (device_token) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      bundle_id = EXCLUDED.bundle_id,
      environment = EXCLUDED.environment,
      user_agent = EXCLUDED.user_agent,
      last_used_at = NOW()
    `,
    [
      randomUUID(),
      input.userId,
      token,
      bundleId,
      environment,
      (input.userAgent ?? '').slice(0, 400),
    ],
  );
  return 'ok';
}

export async function deleteIosDeviceToken(
  pool: pg.Pool,
  deviceToken: string,
  userId?: string,
): Promise<void> {
  const token = deviceToken.trim().toLowerCase();
  if (!token) return;
  if (userId) {
    await pool.query(
      `DELETE FROM auth_ios_device_tokens WHERE device_token = $1 AND user_id = $2`,
      [token, userId],
    );
    return;
  }
  await pool.query(
    `DELETE FROM auth_ios_device_tokens WHERE device_token = $1`,
    [token],
  );
}

export async function listIosDeviceTokensForUser(
  pool: pg.Pool,
  userId: string,
): Promise<IosDeviceTokenRow[]> {
  const res = await pool.query(
    `
    SELECT id, user_id, device_token, bundle_id, environment
    FROM auth_ios_device_tokens
    WHERE user_id = $1
    `,
    [userId],
  );
  return res.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function deleteIosDeviceTokenById(
  pool: pg.Pool,
  tokenId: string,
): Promise<void> {
  await pool.query(`DELETE FROM auth_ios_device_tokens WHERE id = $1`, [
    tokenId,
  ]);
}
