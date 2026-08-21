import { describe, expect, it } from 'vitest';
import {
  isDateTimeLocalInPast,
  parseDateTimeLocalToUtcIso,
  utcIsoToDateTimeLocalValue,
} from '@/features/server-settings/serverEventFormDateTime';

describe('serverEventFormDateTime', () => {
  it('parseDateTimeLocalToUtcIso returns null for empty/invalid', () => {
    expect(parseDateTimeLocalToUtcIso('')).toBeNull();
    expect(parseDateTimeLocalToUtcIso('   ')).toBeNull();
    expect(parseDateTimeLocalToUtcIso('not-a-date')).toBeNull();
  });

  it('utcIso round-trips local field shape', () => {
    const iso = '2026-06-15T14:30:00.000Z';
    const local = utcIsoToDateTimeLocalValue(iso);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const back = parseDateTimeLocalToUtcIso(local);
    expect(back).not.toBeNull();
    expect(Math.abs(new Date(back!).getTime() - new Date(iso).getTime())).toBe(
      0,
    );
  });

  it('isDateTimeLocalInPast detects past values', () => {
    const now = new Date(2026, 4, 24, 12, 0);
    expect(isDateTimeLocalInPast('2026-05-24T11:59', now)).toBe(true);
    expect(isDateTimeLocalInPast('2026-05-24T12:00', now)).toBe(false);
  });
});
