import { tryLocalStorageSetItem } from '@/utils/localStoragePersist';

const STORAGE_KEY = 'echo-outage-recovery-sec-v1';
const MAX_SAMPLES = 20;
/** Used for the recovery timer until we have local history. */
export const DEFAULT_RECOVERY_ESTIMATE_SEC = 60;
const MIN_ESTIMATE_SEC = 15;
/** Ignore absurd outliers (stale tab left open, clock skew). */
const MAX_RECORDED_SEC = 48 * 3600;

type StoredV1 = { v: 1; durationsSec: number[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseStoredDurations(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return [];
    if (parsed.v !== 1) return [];
    const arr = parsed.durationsSec;
    if (!Array.isArray(arr)) return [];
    const out: number[] = [];
    for (const x of arr) {
      if (typeof x !== 'number' || !Number.isFinite(x)) continue;
      const n = Math.floor(x);
      if (n < 1) continue;
      out.push(Math.min(n, MAX_RECORDED_SEC));
    }
    return out.slice(-MAX_SAMPLES);
  } catch {
    return [];
  }
}

function readDurations(): number[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return parseStoredDurations(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeDurations(durationsSec: number[]): void {
  const payload: StoredV1 = { v: 1, durationsSec };
  const raw = JSON.stringify(payload);
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    tryLocalStorageSetItem(STORAGE_KEY, raw);
  }
}

export type EchoOutageRecoveryEstimate = {
  /** Smoothed estimate for UI timer (seconds). */
  estimateSeconds: number;
  sampleCount: number;
  /** Raw mean in seconds, or null if no samples. */
  averageSeconds: number | null;
};

/**
 * Rolling mean of completed outage lengths on this browser (from first failed
 * `/health` poll through successful `/health` + `/auth/me`).
 */
export function getEchoOutageRecoveryEstimate(): EchoOutageRecoveryEstimate {
  const durations = readDurations();
  if (durations.length === 0) {
    return {
      estimateSeconds: DEFAULT_RECOVERY_ESTIMATE_SEC,
      sampleCount: 0,
      averageSeconds: null,
    };
  }
  const sum = durations.reduce((a, b) => a + b, 0);
  const avg = Math.round(sum / durations.length);
  return {
    estimateSeconds: Math.max(MIN_ESTIMATE_SEC, avg),
    sampleCount: durations.length,
    averageSeconds: avg,
  };
}

/**
 * Persist one completed recovery duration (wall time from outage detection to API healthy).
 */
export function recordEchoOutageRecoveryDuration(durationMs: number): void {
  const sec = Math.max(
    1,
    Math.min(MAX_RECORDED_SEC, Math.round(durationMs / 1000)),
  );
  const next = [...readDurations(), sec].slice(-MAX_SAMPLES);
  writeDurations(next);
}

/** @internal — tests only */
export function __resetEchoOutageRecoveryStatsForTests(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
