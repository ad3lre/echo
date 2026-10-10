import type pg from 'pg';
import { config } from '../../config';

/** Thrown when a user exceeds the daily Discord import start quota. */
export class DiscordImportQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscordImportQuotaError';
  }
}

function utcDayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Atomically reserves one first-time metadata import start for this user/day.
 * Failed starts consume a slot so concurrent requests cannot pass the same
 * preflight count. No-op when the configured limit is 0.
 */
export async function reserveDiscordImportMetadataStart(
  pool: pg.Pool,
  userId: string,
): Promise<void> {
  const max = config.discordImportMaxMetadataStartsPerUserPerDay;
  if (!max) return;
  const day = utcDayString();
  const res = await pool.query(
    `INSERT INTO echo_discord_import_user_daily (user_id, day_utc, metadata_starts)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, day_utc) DO UPDATE SET
       metadata_starts = echo_discord_import_user_daily.metadata_starts + 1
     WHERE echo_discord_import_user_daily.metadata_starts < $3
     RETURNING metadata_starts`,
    [userId, day, max],
  );
  if (res.rows.length === 0) {
    throw new DiscordImportQuotaError(
      `Discord import limit reached (${max} new imports per day per user).`,
    );
  }
}
