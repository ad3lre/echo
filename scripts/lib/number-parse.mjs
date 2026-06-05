function finiteNumber(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function parseIntegerInRange(raw, fallback, min, max) {
  const n = finiteNumber(raw);
  if (n == null) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function parseMinInteger(raw, fallback, min) {
  const n = finiteNumber(raw);
  if (n == null) return fallback;
  return Math.max(min, Math.floor(n));
}
