/** Zero-padded two-digit number (e.g. 3 → "03"). */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local calendar day key `YYYY-MM-DD`. */
export function dateToCalendarKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parse `YYYY-MM-DDTHH:mm` (datetime-local shape) as local wall time. */
export function parseDateTimeLocal(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Format a Date as `YYYY-MM-DDTHH:mm` for datetime-local compatibility. */
export function formatDateTimeLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function resolveMinDateTime(
  min: Date | 'now' | undefined,
  now: Date = new Date(),
): Date | null {
  if (min === undefined) return null;
  if (min === 'now') return now;
  return min;
}

export function isDateTimeBeforeMin(
  value: string,
  min: Date | 'now' | undefined,
  now: Date = new Date(),
): boolean {
  const d = parseDateTimeLocal(value);
  const floor = resolveMinDateTime(min, now);
  if (!d || !floor) return false;
  return d.getTime() < floor.getTime();
}
