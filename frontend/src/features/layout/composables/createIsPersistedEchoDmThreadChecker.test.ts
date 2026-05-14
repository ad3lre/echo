import { describe, expect, it } from 'vitest';
import { createIsPersistedEchoDmThreadChecker } from './createIsPersistedEchoDmThreadChecker';

describe('createIsPersistedEchoDmThreadChecker', () => {
  it('delegates to thread id set', () => {
    const ids = new Set(['a', 'b']);
    const check = createIsPersistedEchoDmThreadChecker({
      getEchoDmThreadIds: () => ids,
    });
    expect(check('a')).toBe(true);
    expect(check('z')).toBe(false);
  });
});
