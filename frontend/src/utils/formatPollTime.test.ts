import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatPollTimeRemaining, isPollEnded } from './formatPollTime';

describe('formatPollTimeRemaining', () => {
  it('returns null when endsAt missing', () => {
    expect(formatPollTimeRemaining(undefined)).toBe(null);
  });

  it('returns null for invalid endsAt', () => {
    expect(formatPollTimeRemaining('invalid')).toBe(null);
  });

  it('returns relative ended time when deadline passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-10T12:00:00.000Z'));
    expect(formatPollTimeRemaining('2025-01-01T00:00:00.000Z')).toMatch(
      /^Ended \d+ days? ago$/,
    );
    vi.useRealTimers();
  });

  it('returns hours ago for same-day end', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-10T15:00:00.000Z'));
    expect(formatPollTimeRemaining('2025-01-10T12:00:00.000Z')).toBe(
      'Ended 3 hours ago',
    );
    vi.useRealTimers();
  });

  it('returns just now when ended within a minute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-10T12:00:30.000Z'));
    expect(formatPollTimeRemaining('2025-01-10T12:00:00.000Z')).toBe(
      'Ended just now',
    );
    vi.useRealTimers();
  });

  it('formats days when >= 24h remain', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
    expect(formatPollTimeRemaining('2025-01-03T12:00:00.000Z')).toMatch(
      /^Ends in \d+ days?$/,
    );
    vi.useRealTimers();
  });

  it('formats minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:00:00.000Z'));
    expect(formatPollTimeRemaining('2025-01-01T12:05:00.000Z')).toMatch(
      /^Ends in 5 minutes$/,
    );
    vi.useRealTimers();
  });

  it('uses singular minute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:00:00.000Z'));
    expect(formatPollTimeRemaining('2025-01-01T12:01:00.000Z')).toBe(
      'Ends in 1 minute',
    );
    vi.useRealTimers();
  });
});

describe('isPollEnded', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when endsAt missing', () => {
    expect(isPollEnded(undefined)).toBe(false);
  });

  it('returns true when end is in the past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T12:00:00.000Z'));
    expect(isPollEnded('2025-05-01T00:00:00.000Z')).toBe(true);
  });
});
