import { describe, expect, it } from 'vitest';
import { dedupeMediaBrowseCategories } from '@/composables/useImageBrowseCategories';
import type { MediaBrowseCategory } from '@/data/mediaCategoryLibrary';

describe('dedupeMediaBrowseCategories', () => {
  it('drops case-insensitive slug and name duplicates', () => {
    const rows: MediaBrowseCategory[] = [
      {
        slug: 'childcare',
        name: 'Childcare',
        query: 'childcare',
        navEmoji: '🔥',
      },
      {
        slug: 'Childcare',
        name: 'childcare',
        query: 'childcare',
        navEmoji: '✨',
      },
      { slug: 'nature', name: 'Nature', query: 'nature', navEmoji: '🌿' },
    ];
    const out = dedupeMediaBrowseCategories(rows);
    expect(out).toHaveLength(2);
    expect(out[0]?.slug).toBe('childcare');
    expect(out[1]?.slug).toBe('nature');
  });
});
