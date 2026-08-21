import { describe, expect, it } from 'vitest';
import { echoUserMatchesSearchQuery } from '@/features/layout/echoWorkspace/echoUserSearch';

describe('echoUserMatchesSearchQuery', () => {
  const user = { name: 'Cool Nickname', username: 'cooluser' };

  it('matches empty query', () => {
    expect(echoUserMatchesSearchQuery(user, '')).toBe(true);
    expect(echoUserMatchesSearchQuery(user, '   ')).toBe(true);
  });

  it('matches display name', () => {
    expect(echoUserMatchesSearchQuery(user, 'nickname')).toBe(true);
    expect(echoUserMatchesSearchQuery(user, 'Cool')).toBe(true);
  });

  it('matches username', () => {
    expect(echoUserMatchesSearchQuery(user, 'cooluser')).toBe(true);
    expect(echoUserMatchesSearchQuery(user, 'COOL')).toBe(true);
  });

  it('rejects unrelated queries', () => {
    expect(echoUserMatchesSearchQuery(user, 'other')).toBe(false);
  });

  it('ignores blank username', () => {
    expect(
      echoUserMatchesSearchQuery(
        { name: 'Only Name', username: '   ' },
        'only',
      ),
    ).toBe(true);
    expect(
      echoUserMatchesSearchQuery(
        { name: 'Only Name', username: '   ' },
        'missing',
      ),
    ).toBe(false);
  });
});
