import type { Pool } from 'pg';
import type { ClientEnvironmentSnapshot } from '../../../shared/clientEnvironment';
import { config } from '../config';

type DailyKey = string;

type MemoryDailyRow = {
  dayUtc: string;
  snapshot: ClientEnvironmentSnapshot;
  reportCount: number;
};

const MEMORY_DAILY = new Map<DailyKey, MemoryDailyRow>();

function utcDayString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function dailyKey(dayUtc: string, snapshot: ClientEnvironmentSnapshot): string {
  return [
    dayUtc,
    snapshot.shell,
    snapshot.osFamily,
    snapshot.deviceForm,
    snapshot.browserFamily,
    snapshot.displayMode,
    snapshot.gpuTier,
    snapshot.viewportBucket,
    snapshot.locale,
    snapshot.touch ? '1' : '0',
    snapshot.colorScheme,
    snapshot.connectionType,
  ].join('|');
}

function upsertMemoryDaily(
  dayUtc: string,
  snapshot: ClientEnvironmentSnapshot,
): void {
  const key = dailyKey(dayUtc, snapshot);
  const prev = MEMORY_DAILY.get(key);
  MEMORY_DAILY.set(key, {
    dayUtc,
    snapshot,
    reportCount: (prev?.reportCount ?? 0) + 1,
  });
}

export async function recordClientEnvironmentReport(
  pool: Pool | null,
  snapshot: ClientEnvironmentSnapshot,
): Promise<void> {
  const dayUtc = utcDayString();

  if (config.backendStorageMode !== 'postgres' || !pool) {
    upsertMemoryDaily(dayUtc, snapshot);
    return;
  }

  await pool.query(
    `
    INSERT INTO echo_client_environment_daily (
      day_utc,
      shell,
      os_family,
      device_form,
      browser_family,
      display_mode,
      gpu_tier,
      viewport_bucket,
      locale,
      touch,
      color_scheme,
      connection_type,
      report_count,
      updated_at
    ) VALUES (
      $1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1, NOW()
    )
    ON CONFLICT (
      day_utc,
      shell,
      os_family,
      device_form,
      browser_family,
      display_mode,
      gpu_tier,
      viewport_bucket,
      locale,
      touch,
      color_scheme,
      connection_type
    ) DO UPDATE SET
      report_count = echo_client_environment_daily.report_count + 1,
      updated_at = NOW()
    `,
    [
      dayUtc,
      snapshot.shell,
      snapshot.osFamily,
      snapshot.deviceForm,
      snapshot.browserFamily,
      snapshot.displayMode,
      snapshot.gpuTier,
      snapshot.viewportBucket,
      snapshot.locale,
      snapshot.touch,
      snapshot.colorScheme,
      snapshot.connectionType,
    ],
  );
}

/** Test / dev helper — in-memory rollup rows when Postgres is unavailable. */
export function listMemoryClientEnvironmentDaily(): MemoryDailyRow[] {
  return [...MEMORY_DAILY.values()];
}
