import { describe, expect, it } from 'vitest';
import {
  dateToCalendarKey,
  formatDateTimeLocal,
  isDateTimeBeforeMin,
  parseDateTimeLocal,
  resolveMinDateTime,
} from '@/features/server-settings/calendarDate';

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

  it('parseDateTimeLocal rejects empty and invalid values', () => {
    expect(parseDateTimeLocal('')).toBeNull();
    expect(parseDateTimeLocal('   ')).toBeNull();
    expect(parseDateTimeLocal('not-a-date')).toBeNull();
  });

  it('isDateTimeBeforeMin respects now floor', () => {
    const now = new Date(2026, 4, 24, 12, 0);
    expect(isDateTimeBeforeMin('2026-05-24T11:59', 'now', now)).toBe(true);
    expect(isDateTimeBeforeMin('2026-05-24T12:00', 'now', now)).toBe(false);
    expect(resolveMinDateTime('now', now)?.getTime()).toBe(now.getTime());
    expect(resolveMinDateTime(undefined, now)).toBeNull();
  });
});
