import type { Pool } from 'pg';
import { config } from '../../config';
import type {
  StatusComponentId,
  StatusDayBucket,
  StatusLatestRow,
  StatusProbeResult,
} from './types';

const MEMORY_DAILY = new Map<string, StatusDayBucket>();
const MEMORY_LATEST = new Map<StatusComponentId, StatusLatestRow>();

function dayKey(componentId: StatusComponentId, dayUtc: string): string {
  return `${componentId}:${dayUtc}`;
}

function utcDayString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function upsertMemoryDaily(
  componentId: StatusComponentId,
  dayUtc: string,
  probe: StatusProbeResult,
): void {
  const key = dayKey(componentId, dayUtc);
  const prev = MEMORY_DAILY.get(key) ?? {
    dayUtc,
    probeTotal: 0,
    probeUp: 0,
    probeDegraded: 0,
  };
  MEMORY_DAILY.set(key, {
    dayUtc,
    probeTotal: prev.probeTotal + 1,
    probeUp: prev.probeUp + (probe.ok ? 1 : 0),
    probeDegraded: prev.probeDegraded + (probe.degraded ? 1 : 0),
  });
}

function setMemoryLatest(probe: StatusProbeResult, probedAt: Date): void {
  MEMORY_LATEST.set(probe.componentId, {
    componentId: probe.componentId,
    probedAt: probedAt.toISOString(),
    ok: probe.ok,
    degraded: probe.degraded,
    latencyMs: probe.latencyMs,
  });
}

export async function recordStatusProbes(
  pool: Pool | null,
  probes: StatusProbeResult[],
): Promise<void> {
  const probedAt = new Date();
  const dayUtc = utcDayString(probedAt);

  if (config.backendStorageMode !== 'postgres' || !pool) {
    for (const probe of probes) {
      upsertMemoryDaily(probe.componentId, dayUtc, probe);
      setMemoryLatest(probe, probedAt);
    }
    pruneMemoryOlderThan(config.echoStatusHistoryDays);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const probe of probes) {
      const latency = probe.latencyMs ?? null;
      await client.query(
        `
        INSERT INTO echo_status_daily (
          component_id, day_utc, probe_total, probe_up, probe_degraded,
          latency_ms_sum, latency_ms_max, updated_at
        ) VALUES ($1, $2::date, 1, $3, $4, COALESCE($5, 0), $5, NOW())
        ON CONFLICT (component_id, day_utc) DO UPDATE SET
          probe_total = echo_status_daily.probe_total + 1,
          probe_up = echo_status_daily.probe_up + EXCLUDED.probe_up,
          probe_degraded = echo_status_daily.probe_degraded + EXCLUDED.probe_degraded,
          latency_ms_sum = echo_status_daily.latency_ms_sum + COALESCE(EXCLUDED.latency_ms_max, 0),
          latency_ms_max = GREATEST(
            COALESCE(echo_status_daily.latency_ms_max, 0),
            COALESCE(EXCLUDED.latency_ms_max, 0)
          ),
          updated_at = NOW()
        `,
        [
          probe.componentId,
          dayUtc,
          probe.ok ? 1 : 0,
          probe.degraded ? 1 : 0,
          latency,
        ],
      );

      await client.query(
        `
        INSERT INTO echo_status_latest (
          component_id, probed_at, ok, degraded, latency_ms
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (component_id) DO UPDATE SET
          probed_at = EXCLUDED.probed_at,
          ok = EXCLUDED.ok,
          degraded = EXCLUDED.degraded,
          latency_ms = EXCLUDED.latency_ms
        `,
        [probe.componentId, probedAt, probe.ok, probe.degraded, latency],
      );
    }

    await client.query(
      `
      DELETE FROM echo_status_daily
      WHERE day_utc < (CURRENT_DATE AT TIME ZONE 'UTC') - $1::int
      `,
      [config.echoStatusHistoryDays],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

function pruneMemoryOlderThan(days: number): void {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffStr = utcDayString(cutoff);
  for (const key of MEMORY_DAILY.keys()) {
    const dayUtc = key.split(':').slice(1).join(':');
    if (dayUtc < cutoffStr) MEMORY_DAILY.delete(key);
  }
}

function listUtcDays(historyDays: number): string[] {
  const days: string[] = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  for (let i = historyDays - 1; i >= 0; i -= 1) {
    const d = new Date(cursor);
    d.setUTCDate(cursor.getUTCDate() - i);
    days.push(utcDayString(d));
  }
  return days;
}

export async function loadStatusBuckets(
  pool: Pool | null,
  componentId: StatusComponentId,
  historyDays: number,
): Promise<Map<string, StatusDayBucket>> {
  const days = listUtcDays(historyDays);
  const out = new Map<string, StatusDayBucket>();

  if (config.backendStorageMode !== 'postgres' || !pool) {
    for (const dayUtc of days) {
      const b = MEMORY_DAILY.get(dayKey(componentId, dayUtc));
      if (b) out.set(dayUtc, b);
    }
    return out;
  }

  const res = await pool.query<{
    day_utc: Date;
    probe_total: number;
    probe_up: number;
    probe_degraded: number;
  }>(
    `
    SELECT day_utc, probe_total, probe_up, probe_degraded
    FROM echo_status_daily
    WHERE component_id = $1
      AND day_utc >= (CURRENT_DATE AT TIME ZONE 'UTC') - ($2::int - 1)
    ORDER BY day_utc ASC
    `,
    [componentId, historyDays],
  );

  for (const row of res.rows) {
    const dayUtc =
      row.day_utc instanceof Date
        ? row.day_utc.toISOString().slice(0, 10)
        : String(row.day_utc).slice(0, 10);
    out.set(dayUtc, {
      dayUtc,
      probeTotal: row.probe_total,
      probeUp: row.probe_up,
      probeDegraded: row.probe_degraded,
    });
  }
  return out;
}

export async function loadStatusLatest(
  pool: Pool | null,
): Promise<Map<StatusComponentId, StatusLatestRow>> {
  const out = new Map<StatusComponentId, StatusLatestRow>();

  if (config.backendStorageMode !== 'postgres' || !pool) {
    for (const row of MEMORY_LATEST.values()) {
      out.set(row.componentId, row);
    }
    return out;
  }

  const res = await pool.query<{
    component_id: StatusComponentId;
    probed_at: Date;
    ok: boolean;
    degraded: boolean;
    latency_ms: number | null;
  }>(
    `SELECT component_id, probed_at, ok, degraded, latency_ms FROM echo_status_latest`,
  );

  for (const row of res.rows) {
    out.set(row.component_id, {
      componentId: row.component_id,
      probedAt:
        row.probed_at instanceof Date
          ? row.probed_at.toISOString()
          : String(row.probed_at),
      ok: row.ok,
      degraded: row.degraded,
      latencyMs: row.latency_ms,
    });
  }
  return out;
}
