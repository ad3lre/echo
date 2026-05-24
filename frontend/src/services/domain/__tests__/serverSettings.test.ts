import { describe, expect, it } from 'vitest';
import { normalizeVanity, validateEchoVanityFormat } from '../serverSettings';

describe('validateEchoVanityFormat', () => {
  it('accepts empty as clearable', () => {
    expect(validateEchoVanityFormat('')).toBe('empty');
    expect(validateEchoVanityFormat('   ')).toBe('empty');
  });

  it('accepts valid slugs', () => {
    expect(validateEchoVanityFormat('my-guild')).toBe(true);
    expect(validateEchoVanityFormat('abc')).toBe(true);
  });

  it('rejects invalid slugs', () => {
    expect(validateEchoVanityFormat('ab')).toBe(false);
    expect(validateEchoVanityFormat('My Guild')).toBe(false);
    expect(validateEchoVanityFormat('a--b')).toBe(false);
  });
});

describe('normalizeVanity', () => {
  it('slugifies non-empty input', () => {
    expect(normalizeVanity('My Guild')).toBe('my-guild');
  });
});
