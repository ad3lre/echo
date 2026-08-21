/** Persisted User-Agent strings; keep bounded for DB + logs. */
export function clipUserAgent(raw: unknown, maxLen = 4000): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}
