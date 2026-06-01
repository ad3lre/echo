import { randomUUID } from 'crypto';
import type pg from 'pg';

export type EchoWebPushSubscriptionRow = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function mapRow(row: any): EchoWebPushSubscriptionRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
  };
}

/**
 * Insert or refresh a push subscription. Endpoints are globally unique, so an
 * existing endpoint is re-pointed at the current user (handles re-login on a
 * shared browser) and its keys/last_used are refreshed.
 */
export async function upsertEchoWebPushSubscription(
  pool: pg.Pool,
  input: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string;
  },
): Promise<'ok' | 'invalid'> {
  const endpoint = input.endpoint.trim();
  const p256dh = input.p256dh.trim();
  const auth = input.auth.trim();
  if (!endpoint || !p256dh || !auth) return 'invalid';
  await pool.query(
    `
    INSERT INTO echo_web_push_subscriptions (
      id, user_id, endpoint, p256dh, auth, user_agent, created_at, last_used_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    ON CONFLICT (endpoint) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      user_agent = EXCLUDED.user_agent,
      last_used_at = NOW()
    `,
    [
      randomUUID(),
      input.userId,
      endpoint,
      p256dh,
      auth,
      (input.userAgent ?? '').slice(0, 400),
    ],
  );
  return 'ok';
}

export async function listEchoWebPushSubscriptionsForUser(
  pool: pg.Pool,
  userId: string,
): Promise<EchoWebPushSubscriptionRow[]> {
  const r = await pool.query(
    `
    SELECT id, user_id, endpoint, p256dh, auth
    FROM echo_web_push_subscriptions
    WHERE user_id = $1
    `,
    [userId],
  );
  return r.rows.map(mapRow);
}

export async function deleteEchoWebPushSubscriptionByEndpoint(
  pool: pg.Pool,
  endpoint: string,
  userId?: string,
): Promise<void> {
  const e = endpoint.trim();
  if (!e) return;
  if (userId) {
    await pool.query(
      `DELETE FROM echo_web_push_subscriptions WHERE endpoint = $1 AND user_id = $2`,
      [e, userId],
    );
    return;
  }
  await pool.query(
    `DELETE FROM echo_web_push_subscriptions WHERE endpoint = $1`,
    [e],
  );
}

export async function touchEchoWebPushSubscription(
  pool: pg.Pool,
  endpoint: string,
): Promise<void> {
  const e = endpoint.trim();
  if (!e) return;
  await pool.query(
    `UPDATE echo_web_push_subscriptions SET last_used_at = NOW() WHERE endpoint = $1`,
    [e],
  );
}
