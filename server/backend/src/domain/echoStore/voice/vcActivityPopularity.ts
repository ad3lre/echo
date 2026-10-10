import type { Pool } from 'pg';
import {
  ECHO_VC_ACTIVITY_KEYS,
  isEchoVcActivityKey,
  type EchoVcActivityKey,
} from '../../../../../activities/cores/vcActivityCatalog';

export type EchoVcActivityPopularityRow = {
  activityKey: EchoVcActivityKey;
  openCount: number;
};

/**
 * Increments global “user opened this activity from the library” counter.
 * One increment per successful launch from the picker or equivalent entry.
 */
export async function incrementEchoVcActivityOpen(
  pool: Pool,
  userId: string,
  activityKey: EchoVcActivityKey,
): Promise<void> {
  await pool.query(
    `INSERT INTO echo_vc_activity_user_opens (user_id, activity_key, utc_day)
     VALUES ($1, $2, (NOW() AT TIME ZONE 'UTC')::date)
     ON CONFLICT (user_id, activity_key, utc_day) DO NOTHING
     RETURNING user_id`,
    [userId, activityKey],
  );
}

/**
 * All catalog activities with counts (0 when never opened), ordered by popularity then key.
 */
export async function listEchoVcActivityPopularityOrdered(
  pool: Pool,
): Promise<EchoVcActivityPopularityRow[]> {
  const keys = [...ECHO_VC_ACTIVITY_KEYS];
  const r = await pool.query<{ activity_key: string; open_count: string }>(
    `SELECT u.k AS activity_key, COALESCE(o.open_count, 0) AS open_count
     FROM unnest($1::text[]) AS u(k)
     LEFT JOIN (
       SELECT activity_key, COUNT(*)::bigint AS open_count
       FROM echo_vc_activity_user_opens GROUP BY activity_key
     ) o ON o.activity_key = u.k
     ORDER BY open_count DESC, u.k ASC`,
    [keys],
  );
  const out: EchoVcActivityPopularityRow[] = [];
  for (const row of r.rows) {
    if (!isEchoVcActivityKey(row.activity_key)) continue;
    const n = Number(row.open_count);
    out.push({
      activityKey: row.activity_key,
      openCount: Number.isFinite(n) ? n : 0,
    });
  }
  return out;
}
