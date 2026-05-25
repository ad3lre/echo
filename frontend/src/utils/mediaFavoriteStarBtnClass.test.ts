import { describe, it, expect } from 'vitest';
import { mediaFavoriteStarBtnClass } from '@/utils/mediaFavoriteStarBtnClass';

describe('mediaFavoriteStarBtnClass', () => {
  it('always shows favorited stars', () => {
    const cls = mediaFavoriteStarBtnClass(true, false);
    expect(cls).toContain('text-amber-300');
    expect(cls).toContain('opacity-100');
    expect(cls).not.toContain('sm:opacity-0');
  });

  it('shows unfavorited stars while tile is actively previewed', () => {
    const cls = mediaFavoriteStarBtnClass(false, true);
    expect(cls).toContain('opacity-100');
    expect(cls).not.toContain('sm:opacity-0');
  });

  it('hides unfavorited stars on sm+ until hover when tile is idle', () => {
    const cls = mediaFavoriteStarBtnClass(false, false);
    expect(cls).toContain('sm:opacity-0');
    expect(cls).toContain('sm:group-hover:opacity-100');
  });
});
