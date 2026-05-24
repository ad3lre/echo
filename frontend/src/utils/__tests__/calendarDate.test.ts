import { describe, expect, it } from 'vitest';
import {
  buildMonthGrid,
  compareCalendarDays,
  dateToCalendarKey,
  formatDateTimeLocal,
  isDateTimeBeforeMin,
  parseDateTimeLocal,
  resolveMinDateTime,
} from '@/utils/calendarDate';

describe('calendarDate', () => {
  it('dateToCalendarKey and parse/format round-trip', () => {
    const d = new Date(2026, 4, 24, 15, 45);
    expect(dateToCalendarKey(d)).toBe('2026-05-24');
    expect(formatDateTimeLocal(d)).toBe('2026-05-24T15:45');
    const back = parseDateTimeLocal('2026-05-24T15:45');
    expect(back).not.toBeNull();
    expect(back!.getFullYear()).toBe(2026);
    expect(back!.getMonth()).toBe(4);
    expect(back!.getDate()).toBe(24);
    expect(back!.getHours()).toBe(15);
    expect(back!.getMinutes()).toBe(45);
  });

  it('buildMonthGrid returns 42 cells with correct inMonth flags', () => {
    const grid = buildMonthGrid(2026, 4);
    expect(grid).toHaveLength(42);
    const inMonth = grid.filter((c) => c.inMonth);
    expect(inMonth.length).toBeGreaterThan(27);
    expect(inMonth[0]!.date.getMonth()).toBe(4);
  });

  it('compareCalendarDays orders by day', () => {
    const a = new Date(2026, 0, 1);
    const b = new Date(2026, 0, 2);
    expect(compareCalendarDays(a, b)).toBe(-1);
    expect(compareCalendarDays(b, a)).toBe(1);
    expect(compareCalendarDays(a, a)).toBe(0);
  });

  it('isDateTimeBeforeMin respects now floor', () => {
    const now = new Date(2026, 4, 24, 12, 0);
    expect(isDateTimeBeforeMin('2026-05-24T11:59', 'now', now)).toBe(true);
    expect(isDateTimeBeforeMin('2026-05-24T12:00', 'now', now)).toBe(false);
    expect(resolveMinDateTime('now', now)?.getTime()).toBe(now.getTime());
  });
});
