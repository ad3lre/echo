import { describe, expect, it } from 'vitest';
import {
  GIF_BROWSE_CATEGORIES,
  IMAGE_BROWSE_CATEGORIES,
  gifCategoryBySlug,
  imageCategoryBySlug,
} from '@/features/chat/mediaSearch/mediaCategoryLibrary';

describe('mediaCategoryLibrary', () => {
  it('defines unique GIF category slugs', () => {
    const slugs = GIF_BROWSE_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(gifCategoryBySlug('trending')?.name).toBe('Trending');
  });

  it('defines unique image category slugs', () => {
    const slugs = IMAGE_BROWSE_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(imageCategoryBySlug('nature')?.query).toContain('nature');
  });
});
