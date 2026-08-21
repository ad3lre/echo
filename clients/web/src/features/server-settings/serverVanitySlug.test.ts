import { describe, expect, it } from 'vitest';
import {
  mergeServerListsForVanity,
  slugifyServerName,
  suggestServerVanityCode,
} from './serverVanitySlug';

describe('slugifyServerName', () => {
  it('normalizes accents and punctuation', () => {
    expect(slugifyServerName('  Café Lumière!!!  ')).toBe('cafe-lumiere');
  });

  it('returns server for empty result', () => {
    expect(slugifyServerName('@@@')).toBe('server');
  });
});

describe('mergeServerListsForVanity', () => {
  it('dedupes by id with later winning', () => {
    const merged = mergeServerListsForVanity(
      [{ id: 'a', name: 'A' }],
      [
        { id: 'a', name: 'A2' },
        { id: 'b', name: 'B' },
      ],
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((s) => s.id === 'a')?.name).toBe('A2');
  });
});

describe('suggestServerVanityCode', () => {
  it('returns base when not taken', () => {
    expect(suggestServerVanityCode('My Guild', 'self', [])).toBe('my-guild');
  });

  it('appends numeric suffix when slug taken', () => {
    const all = [{ id: 'o', name: 'My Guild' }];
    expect(suggestServerVanityCode('My Guild', 'self', all)).toBe('my-guild-2');
  });
});
