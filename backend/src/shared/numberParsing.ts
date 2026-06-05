export function boundedInteger(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim()
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function minInteger(
  raw: unknown,
  fallback: number,
  min: number,
): number {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim()
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.floor(n));
}
