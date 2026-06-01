import type pg from 'pg';
import type {
  EchoChannelNotificationOverride,
  EchoServerNotificationLevel,
} from '../../../../shared/types';

const VALID_LEVELS = new Set<EchoServerNotificationLevel>([
  'all',
  'mentions',
  'mentions_direct',
  'none',
]);

function normalizeLevel(level: unknown): EchoServerNotificationLevel | null {
  if (typeof level !== 'string') return null;
  const trimmed = level.trim();
  return VALID_LEVELS.has(trimmed as EchoServerNotificationLevel)
    ? (trimmed as EchoServerNotificationLevel)
    : null;
}

export async function listEchoChannelNotificationOverridesForUser(
  pool: pg.Pool,
  userId: string,
  channelIds?: string[],
): Promise<Record<string, EchoChannelNotificationOverride>> {
  const ids = Array.isArray(channelIds)
    ? [...new Set(channelIds.map((id) => id.trim()).filter(Boolean))]
    : null;
  if (ids && ids.length === 0) return {};
  const r = ids
    ? await pool.query(
        `
        SELECT channel_id, level, muted_until
        FROM echo_channel_notification_overrides
        WHERE user_id = $1 AND channel_id = ANY($2::text[])
        `,
        [userId, ids],
      )
    : await pool.query(
        `
        SELECT channel_id, level, muted_until
        FROM echo_channel_notification_overrides
        WHERE user_id = $1
        `,
        [userId],
      );
  const out: Record<string, EchoChannelNotificationOverride> = {};
  for (const row of r.rows) {
    const channelId = String(row.channel_id ?? '').trim();
    if (!channelId) continue;
    const level = normalizeLevel(row.level);
    const mutedUntil =
      row.muted_until != null
        ? new Date(row.muted_until as string | Date).toISOString()
        : null;
    if (!level && !mutedUntil) continue;
    out[channelId] = {
      ...(level ? { level } : {}),
      ...(mutedUntil ? { mutedUntil } : {}),
    };
  }
  return out;
}

export type UpsertChannelNotificationOverrideInput = {
  /** Raw level string (validated here); `null` clears the level override. */
  level?: EchoServerNotificationLevel | string | null;
  /** ISO timestamp, or `null` to clear snooze. */
  mutedUntil?: string | null;
};

/**
 * Replace a viewer's override for one channel. When both `level` and
 * `mutedUntil` resolve to empty the row is deleted (back to server defaults).
 */
export async function upsertEchoChannelNotificationOverride(
  pool: pg.Pool,
  userId: string,
  channelId: string,
  input: UpsertChannelNotificationOverrideInput,
): Promise<'ok' | 'invalid'> {
  const cid = channelId.trim();
  if (!cid) return 'invalid';

  let level: EchoServerNotificationLevel | null = null;
  if (input.level != null) {
    level = normalizeLevel(input.level);
    if (!level) return 'invalid';
  }

  let mutedUntilIso: string | null = null;
  if (input.mutedUntil != null) {
    const t = Date.parse(input.mutedUntil);
    if (!Number.isFinite(t)) return 'invalid';
    mutedUntilIso = new Date(t).toISOString();
  }

  if (!level && !mutedUntilIso) {
    await pool.query(
      `
      DELETE FROM echo_channel_notification_overrides
      WHERE user_id = $1 AND channel_id = $2
      `,
      [userId, cid],
    );
    return 'ok';
  }

  await pool.query(
    `
    INSERT INTO echo_channel_notification_overrides (
      user_id, channel_id, level, muted_until, updated_at
    )
    VALUES ($1, $2, $3, $4::timestamptz, NOW())
    ON CONFLICT (user_id, channel_id) DO UPDATE SET
      level = EXCLUDED.level,
      muted_until = EXCLUDED.muted_until,
      updated_at = NOW()
    `,
    [userId, cid, level, mutedUntilIso],
  );
  return 'ok';
}
