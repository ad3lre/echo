function parseFiniteNumber(raw: string | null | undefined): number | null {
  const text = raw?.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function parseIntegerInRange(
  raw: string | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = parseFiniteNumber(raw);
  if (n == null) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function parseMinInteger(
  raw: string | null | undefined,
  fallback: number,
  min: number,
): number {
  const n = parseFiniteNumber(raw);
  if (n == null) return fallback;
  return Math.max(min, Math.floor(n));
}

export function parseRetryAfterMs(
  raw: string | null | undefined,
  fallbackMs: number,
  minMs: number,
  maxMs: number,
): number {
  const seconds = parseFiniteNumber(raw);
  if (seconds == null) return fallbackMs;
  const ms = Math.ceil(seconds * 1000);
  return Math.min(maxMs, Math.max(minMs, ms));
}
