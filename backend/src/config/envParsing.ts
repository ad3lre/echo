import { boundedInteger, minInteger } from '../shared/numberParsing';

export function normalizeEnvValue(raw: string | undefined): string {
  return (raw ?? '').trim();
}

export function parseBoolean(
  raw: string | undefined,
  defaultValue: boolean,
): boolean {
  if (raw === undefined) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export function envTrim(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export function envBoundedInt(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  return boundedInteger(process.env[name]?.trim(), fallback, min, max);
}

export function envMinInt(name: string, fallback: number, min: number): number {
  return minInteger(process.env[name]?.trim(), fallback, min);
}

/** Allows explicit `0` when set in env; otherwise non-negative int with fallback. */
export function envNonNegInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (raw === '0') return 0;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/**
 * Serper refresh failure cap: `0` disables; unset defaults to 0; valid values are >= 1.
 */
export function envSerperRefreshFailureMaxCount(): number {
  const raw = process.env.SERPER_REFRESH_FAILURE_MAX_COUNT?.trim();
  const n = raw ? Number(raw) : NaN;
  if (raw === '0') return 0;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 0;
}

export function envCsv(name: string): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
