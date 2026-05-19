import { describe, expect, it } from 'vitest';
import {
  parseDateTimeLocalToUtcIso,
  utcIsoToDateTimeLocalValue,
} from '@/features/server-settings/utils/serverEventFormDateTime';

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
});
