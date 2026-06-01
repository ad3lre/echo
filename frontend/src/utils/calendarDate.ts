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

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Compare two dates by calendar day only (-1, 0, 1). */
export function compareCalendarDays(a: Date, b: Date): number {
  const ak = dateToCalendarKey(a);
  const bk = dateToCalendarKey(b);
  if (ak < bk) return -1;
  if (ak > bk) return 1;
  return 0;
}

export type CalendarCell = {
  date: Date;
  inMonth: boolean;
};

/** Build a 6×7 grid (Sunday-first) for the given month. */
export function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + i,
    );
    cells.push({ date, inMonth: date.getMonth() === month });
  }
  return cells;
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

/** Round up to the next 5-minute boundary (for sensible default times). */
export function ceilToFiveMinutes(d: Date): Date {
  const out = new Date(d.getTime());
  const ms = 5 * 60 * 1000;
  const rounded = Math.ceil(out.getTime() / ms) * ms;
  return new Date(rounded);
}

export const YEAR_PICKER_PAGE_SIZE = 12;

/** Localized short month label for picker grids (0 = January). */
export function monthShortLabel(
  month: number,
  locales?: Intl.LocalesArgument,
): string {
  return new Date(2000, month, 1).toLocaleString(locales, { month: 'short' });
}

/** True when every day in the month is before `min`. */
export function isCalendarMonthBeforeMin(
  year: number,
  month: number,
  min: Date | null,
): boolean {
  if (!min) return false;
  const lastDay = new Date(year, month + 1, 0);
  return compareCalendarDays(lastDay, min) < 0;
}

/** True when every day in the year is before `min`. */
export function isCalendarYearBeforeMin(
  year: number,
  min: Date | null,
): boolean {
  if (!min) return false;
  const lastDay = new Date(year, 11, 31);
  return compareCalendarDays(lastDay, min) < 0;
}

export function buildYearPage(
  startYear: number,
  count = YEAR_PICKER_PAGE_SIZE,
): number[] {
  return Array.from({ length: count }, (_, i) => startYear + i);
}

export function centeredYearPageStart(
  year: number,
  count = YEAR_PICKER_PAGE_SIZE,
): number {
  return year - Math.floor(count / 2);
}
