import type pg from 'pg';
import { shouldMarkOffline } from '../../echoPresenceAuthority';

/** Hard cap for `GET /presence?ids=` — keeps `ANY($1::text[])` bounded (abuse / accidental megachunks). */
export const ECHO_PRESENCE_BATCH_MAX_USER_IDS = 200;

export async function markStaleEchoPresenceOffline(
  pool: pg.Pool,
  staleAfterMinutes: number,
): Promise<string[]> {
  const nowMs = Date.now();
  const r = await pool.query(
    `
    SELECT user_id, EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at_ms
    FROM echo_presence
    WHERE status <> 'offline'
    `,
  );
  const userIds = r.rows
    .filter((row: { updated_at_ms: string | number }) =>
      shouldMarkOffline(Number(row.updated_at_ms), nowMs, staleAfterMinutes),
    )
    .map((row: { user_id: string }) => String(row.user_id));
  if (userIds.length === 0) return [];
  await pool.query(
    `
    UPDATE echo_presence
    SET status = 'offline',
        active_client = 'web',
        updated_at = TO_TIMESTAMP($2::double precision / 1000.0),
        last_online_at = TO_TIMESTAMP($2::double precision / 1000.0)
    WHERE user_id = ANY($1::text[])
    `,
    [userIds, nowMs],
  );
  return userIds;
}

export async function upsertEchoPresence(
  pool: pg.Pool,
  userId: string,
  status: string,
  activeClient: 'web' | 'mobile' = 'web',
): Promise<void> {
  // Update last_online_at when user comes online (status is not 'offline')
  await pool.query(
    `
    INSERT INTO echo_presence (user_id, status, active_client, updated_at, last_online_at)
    VALUES ($1, $2, $3, NOW(), CASE WHEN $2 <> 'offline' THEN NOW() ELSE NULL END)
    ON CONFLICT (user_id) DO UPDATE SET
      status = $2,
      active_client = $3,
      updated_at = NOW(),
      last_online_at = CASE
        WHEN $2 <> 'offline' THEN NOW()
        WHEN echo_presence.last_online_at IS NULL THEN echo_presence.updated_at
        ELSE echo_presence.last_online_at
      END
    `,
    [userId, status, activeClient],
  );
}

export async function getEchoPresenceState(
  pool: pg.Pool,
  userId: string,
): Promise<{ userId: string; status: string; updatedAtMs: number } | null> {
  const r = await pool.query(
    `
    SELECT
      user_id,
      status,
      EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at_ms
    FROM echo_presence
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    userId: String(row.user_id),
    status: String(row.status),
    updatedAtMs: Number(row.updated_at_ms),
  };
}

export async function touchEchoPresence(
  pool: pg.Pool,
  userId: string,
): Promise<boolean> {
  const r = await pool.query(
    `
    UPDATE echo_presence
    SET updated_at = NOW()
    WHERE user_id = $1
    `,
    [userId],
  );
  return Number(r.rowCount ?? 0) > 0;
}

export async function getEchoPresence(
  pool: pg.Pool,
  userIds: string[],
): Promise<Record<string, string>> {
  const rows = await getEchoPresenceRows(pool, userIds);
  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.userId] = row.status;
  }
  return out;
}

export async function getEchoPresenceRows(
  pool: pg.Pool,
  userIds: string[],
): Promise<
  { userId: string; status: string; activeClient: 'web' | 'mobile' }[]
> {
  if (userIds.length === 0) return [];
  const r = await pool.query(
    `SELECT user_id, status, active_client FROM echo_presence WHERE user_id = ANY($1::text[])`,
    [userIds],
  );
  return r.rows.map((row) => ({
    userId: String(row.user_id),
    status: String(row.status),
    activeClient: row.active_client === 'mobile' ? 'mobile' : ('web' as const),
  }));
}

export async function getEchoPresenceWithLastOnline(
  pool: pg.Pool,
  userIds: string[],
): Promise<
  {
    userId: string;
    status: string;
    activeClient: 'web' | 'mobile';
    lastOnlineAt: string | null;
  }[]
> {
  if (userIds.length === 0) return [];
  const r = await pool.query(
    `SELECT p.user_id, p.status, p.active_client,
            CASE WHEN u.show_last_online THEN p.last_online_at ELSE NULL END AS last_online_at
     FROM echo_presence p
     JOIN auth_users u ON p.user_id = u.id
     WHERE p.user_id = ANY($1::text[])`,
    [userIds],
  );
  return r.rows.map((row) => ({
    userId: String(row.user_id),
    status: String(row.status),
    activeClient: row.active_client === 'mobile' ? 'mobile' : ('web' as const),
    lastOnlineAt: row.last_online_at ? String(row.last_online_at) : null,
  }));
}

export async function getEchoLastOnline(
  pool: pg.Pool,
  userId: string,
): Promise<string | null> {
  const r = await pool.query(
    `
    SELECT last_online_at
    FROM echo_presence
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId],
  );
  const row = r.rows[0];
  if (!row || !row.last_online_at) return null;
  return String(row.last_online_at);
}
