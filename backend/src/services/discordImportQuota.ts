import type pg from 'pg';
import { config } from '../config';

/** Thrown when a user exceeds the daily Discord import (metadata) start quota in production. */
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
 * Enforces max new import pipelines per user per UTC day (counts first-time metadata import per server).
 * No-op when {@link config.discordImportMaxMetadataStartsPerUserPerDay} is 0.
 */
export async function assertDiscordImportMetadataQuota(
  pool: pg.Pool,
  userId: string,
): Promise<void> {
  const max = config.discordImportMaxMetadataStartsPerUserPerDay;
  if (!max) return;
  const day = utcDayString();
  const res = await pool.query<{ metadata_starts: string | number }>(
    `SELECT metadata_starts FROM echo_discord_import_user_daily WHERE user_id = $1 AND day_utc = $2`,
    [userId, day],
  );
  const n = Number(res.rows[0]?.metadata_starts ?? 0);
  if (n >= max) {
    throw new DiscordImportQuotaError(
      `Discord import limit reached (${max} new imports per day per user).`,
    );
  }
}

/** Records one metadata import start for quota (after successful metadata save). */
export async function recordDiscordImportMetadataStarted(
  pool: pg.Pool,
  userId: string,
): Promise<void> {
  const max = config.discordImportMaxMetadataStartsPerUserPerDay;
  if (!max) return;
  const day = utcDayString();
  await pool.query(
    `INSERT INTO echo_discord_import_user_daily (user_id, day_utc, metadata_starts)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, day_utc) DO UPDATE SET
       metadata_starts = echo_discord_import_user_daily.metadata_starts + 1`,
    [userId, day],
  );
}
