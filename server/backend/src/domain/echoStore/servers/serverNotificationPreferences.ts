import type pg from 'pg';
import type { EchoServerNotificationLevel } from '../../../../../../contracts/types';

const VALID_LEVELS = new Set<EchoServerNotificationLevel>([
  'all',
  'mentions',
  'mentions_direct',
  'none',
]);

function normalizeLevel(level: string): EchoServerNotificationLevel | null {
  const trimmed = level.trim();
  return VALID_LEVELS.has(trimmed as EchoServerNotificationLevel)
    ? (trimmed as EchoServerNotificationLevel)
    : null;
}

export async function listEchoServerNotificationLevelsForUser(
  pool: pg.Pool,
  userId: string,
  serverIds?: string[],
): Promise<Record<string, EchoServerNotificationLevel>> {
  const ids = Array.isArray(serverIds)
    ? [...new Set(serverIds.map((id) => id.trim()).filter(Boolean))]
    : null;
  const r = ids
    ? await pool.query(
        `
        SELECT server_id, level
        FROM echo_server_notification_preferences
        WHERE user_id = $1
          AND server_id = ANY($2::text[])
        `,
        [userId, ids],
      )
    : await pool.query(
        `
        SELECT server_id, level
        FROM echo_server_notification_preferences
        WHERE user_id = $1
        `,
        [userId],
      );
  const out: Record<string, EchoServerNotificationLevel> = {};
  for (const row of r.rows) {
    const serverId = String(row.server_id ?? '').trim();
    const level = normalizeLevel(String(row.level ?? ''));
    if (!serverId || !level) continue;
    out[serverId] = level;
  }
  return out;
}

export async function upsertEchoServerNotificationLevel(
  pool: pg.Pool,
  userId: string,
  serverId: string,
  level: EchoServerNotificationLevel,
): Promise<'ok' | 'invalid'> {
  if (!VALID_LEVELS.has(level)) return 'invalid';
  await pool.query(
    `
    INSERT INTO echo_server_notification_preferences (
      user_id,
      server_id,
      level,
      updated_at
    )
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (user_id, server_id) DO UPDATE SET
      level = EXCLUDED.level,
      updated_at = NOW()
    `,
    [userId, serverId, level],
  );
  return 'ok';
}
