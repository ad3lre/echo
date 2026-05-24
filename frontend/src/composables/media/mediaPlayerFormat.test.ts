import { describe, expect, it } from 'vitest';
import { formatMediaTime, mediaBufferedPercent } from './mediaPlayerFormat';

describe('formatMediaTime', () => {
  it('formats sub-hour durations', () => {
    expect(formatMediaTime(65)).toBe('1:05');
    expect(formatMediaTime(0)).toBe('0:00');
  });

  it('formats hour-plus durations', () => {
    expect(formatMediaTime(3661)).toBe('1:01:01');
  });

  it('handles invalid input', () => {
    expect(formatMediaTime(Number.NaN)).toBe('0:00');
    expect(formatMediaTime(-1)).toBe('0:00');
  });
});

describe('mediaBufferedPercent', () => {
  it('returns 0 when element is missing', () => {
    expect(mediaBufferedPercent(null)).toBe(0);
  });

  it('computes percent from buffered ranges', () => {
    const el = {
      duration: 100,
      currentTime: 10,
      buffered: {
        length: 1,
        start: () => 0,
        end: () => 50,
      },
    } as unknown as HTMLMediaElement;
    expect(mediaBufferedPercent(el)).toBe(50);
  });
});
