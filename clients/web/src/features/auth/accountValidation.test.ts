import { describe, expect, it } from 'vitest';
import {
  MIN_REGISTER_PASSWORD_STRENGTH_PCT,
  computePasswordStrength,
  isValidEmailFormat,
  normalizeEmail,
} from './accountValidation';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  User@EXAMPLE.com  ')).toBe('user@example.com');
  });
});

describe('isValidEmailFormat', () => {
  it('rejects too short or invalid shape', () => {
    expect(isValidEmailFormat('a@b')).toBe(false);
    expect(isValidEmailFormat('not-an-email')).toBe(false);
  });

  it('accepts simple valid addresses', () => {
    expect(isValidEmailFormat('user@example.com')).toBe(true);
  });
});

describe('computePasswordStrength', () => {
  it('returns zeros for empty password', () => {
    expect(computePasswordStrength('')).toEqual({
      score: 0,
      fillPct: 0,
      label: '',
    });
  });

  it('labels tiers by fillPct', () => {
    expect(computePasswordStrength('short').label).toBe('Weak');
    const strong = computePasswordStrength('Aa1!aaaaaaaaaaaa'); // long + classes
    expect(strong.fillPct).toBeGreaterThanOrEqual(
      MIN_REGISTER_PASSWORD_STRENGTH_PCT,
    );
    expect(['Fair', 'Good', 'Strong']).toContain(strong.label);
  });
});
