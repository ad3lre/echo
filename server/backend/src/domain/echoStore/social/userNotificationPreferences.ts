import type pg from 'pg';

export type EchoUserNotificationPreferences = {
  settings: Record<string, unknown>;
  updatedAt: string;
};

/** Reject absurdly large blobs; the real payload is a few hundred bytes. */
const MAX_SETTINGS_BYTES = 16 * 1024;

export async function getEchoUserNotificationPreferences(
  pool: pg.Pool,
  userId: string,
): Promise<EchoUserNotificationPreferences | null> {
  const r = await pool.query(
    `
    SELECT settings, updated_at
    FROM echo_user_notification_preferences
    WHERE user_id = $1
    `,
    [userId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const settings =
    row.settings && typeof row.settings === 'object'
      ? (row.settings as Record<string, unknown>)
      : {};
  return {
    settings,
    updatedAt: new Date(row.updated_at as string | Date).toISOString(),
  };
}

export async function upsertEchoUserNotificationPreferences(
  pool: pg.Pool,
  userId: string,
  settings: unknown,
): Promise<'ok' | 'invalid'> {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return 'invalid';
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(settings);
  } catch {
    return 'invalid';
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SETTINGS_BYTES) {
    return 'invalid';
  }
  await pool.query(
    `
    INSERT INTO echo_user_notification_preferences (user_id, settings, updated_at)
    VALUES ($1, $2::jsonb, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      settings = EXCLUDED.settings,
      updated_at = NOW()
    `,
    [userId, serialized],
  );
  return 'ok';
}
