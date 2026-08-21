import { describe, expect, it } from 'vitest';
import {
  formatAuthSessionSummary,
  parseAuthSessionUserAgent,
} from './authSessionDeviceLabel';

describe('parseAuthSessionUserAgent', () => {
  it('detects Chrome on Windows', () => {
    const env = parseAuthSessionUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    expect(env.browser).toBe('Chrome');
    expect(env.os).toMatch(/Windows/);
  });

  it('detects Safari on iPhone', () => {
    const env = parseAuthSessionUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    expect(env.browser).toBe('Safari');
    expect(env.os).toMatch(/^iOS/);
  });
});

describe('formatAuthSessionSummary', () => {
  it('includes location when present', () => {
    expect(
      formatAuthSessionSummary({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        location: 'London, GB',
      }),
    ).toContain('London, GB');
    expect(
      formatAuthSessionSummary({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        location: 'London, GB',
      }),
    ).toContain('Chrome');
  });
});
