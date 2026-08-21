import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveTimeLanguagePreferences } from '@/features/settings/timeLanguagePreferences';
import { formatTimestamp } from './formatTimestamp';

describe('formatTimestamp', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, String(value));
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T18:00:00.000Z'));
    saveTimeLanguagePreferences({ locale: 'en-US', timeZone: 'UTC' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns fallback for invalid ISO', () => {
    expect(formatTimestamp('not-a-date')).toBe('Invalid date');
  });

  it('uses Today when date matches system today (local)', () => {
    const localToday = new Date();
    const iso = new Date(
      localToday.getFullYear(),
      localToday.getMonth(),
      localToday.getDate(),
      10,
      30,
      0,
    ).toISOString();
    expect(formatTimestamp(iso)).toMatch(/^Today at /);
  });

  it('uses Yesterday when date is previous calendar day', () => {
    const now = new Date();
    const y = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
      12,
      0,
      0,
    );
    const yLabel = formatTimestamp(y.toISOString());
    expect(yLabel).toMatch(/^Yesterday /);
    expect(yLabel).not.toContain(' at ');
  });

  it('uses saved locale formatting for older days', () => {
    expect(formatTimestamp('2020-01-05T12:00:00.000Z')).toMatch(
      /^\d{2}\/\d{2}\/\d{4} \d/,
    );
    expect(formatTimestamp('2020-01-05T12:00:00.000Z')).not.toContain(' at ');
  });
});
