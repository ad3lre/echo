/**
 * HTML `datetime-local` values are local wall time without a zone; `Date` parses them as local.
 * Returns ISO UTC string or null if empty / invalid.
 */
export function parseDateTimeLocalToUtcIso(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** UTC ISO → `YYYY-MM-DDTHH:mm` for `datetime-local` (local fields). */
export function utcIsoToDateTimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** True when the datetime-local value parses to a moment strictly before `now`. */
export function isDateTimeLocalInPast(
  value: string,
  now: Date = new Date(),
): boolean {
  const d = parseDateTimeLocalToUtcIso(value);
  if (!d) return false;
  return new Date(d).getTime() < now.getTime();
}
