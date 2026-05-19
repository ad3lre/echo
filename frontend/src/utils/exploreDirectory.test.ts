import { describe, expect, it } from 'vitest';
import {
  EXPLORE_SERVER_FALLBACK_BLURB,
  exploreDirectoryBlurb,
  isExcludedFromExploreDirectory,
} from './exploreDirectory';

describe('isExcludedFromExploreDirectory', () => {
  it('excludes DM pseudo-server id and direct-messages names', () => {
    expect(
      isExcludedFromExploreDirectory({ id: 'echo', name: 'Anything' }),
    ).toBe(true);
    expect(isExcludedFromExploreDirectory({ name: 'Direct Messages' })).toBe(
      true,
    );
    expect(isExcludedFromExploreDirectory({ name: '  direct message  ' })).toBe(
      true,
    );
    expect(
      isExcludedFromExploreDirectory({ id: '123', name: 'My Guild' }),
    ).toBe(false);
    expect(
      isExcludedFromExploreDirectory({ id: '1', name: 'Spam Filter Server' }),
    ).toBe(true);
    expect(
      isExcludedFromExploreDirectory({
        id: '1',
        name: 'Uploads Presign Server',
      }),
    ).toBe(true);
  });
});

describe('exploreDirectoryBlurb', () => {
  it('uses fallback for empty or non-string', () => {
    expect(exploreDirectoryBlurb(undefined)).toBe(
      EXPLORE_SERVER_FALLBACK_BLURB,
    );
    expect(exploreDirectoryBlurb('  \n')).toBe(EXPLORE_SERVER_FALLBACK_BLURB);
  });

  it('returns trimmed custom blurb', () => {
    expect(exploreDirectoryBlurb('  Hello world  ')).toBe('Hello world');
  });
});
