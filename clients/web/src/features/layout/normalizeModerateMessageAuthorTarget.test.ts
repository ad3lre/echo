import { describe, expect, it } from 'vitest';
import { normalizeModerateMessageAuthorTarget } from './normalizeModerateMessageAuthorTarget';

describe('normalizeModerateMessageAuthorTarget', () => {
  it('passes through string', () => {
    expect(normalizeModerateMessageAuthorTarget('u1')).toBe('u1');
  });

  it('prefers authorId', () => {
    expect(
      normalizeModerateMessageAuthorTarget({
        authorId: 'a',
        userId: 'b',
      }),
    ).toBe('a');
  });

  it('falls back to userId', () => {
    expect(normalizeModerateMessageAuthorTarget({ userId: 'b' })).toBe('b');
  });

  it('empty object', () => {
    expect(normalizeModerateMessageAuthorTarget({})).toBe('');
  });
});
