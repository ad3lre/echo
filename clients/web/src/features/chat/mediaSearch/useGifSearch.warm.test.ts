import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GIF_BROWSE_CATEGORIES } from '@/features/chat/mediaSearch/mediaCategoryLibrary';
import {
  __clearGifSearchCacheForTests,
  getCachedGifCategoryResults,
  warmGifCategoryLibrary,
} from '@/features/chat/mediaSearch/useGifSearch';

vi.mock('@/api/client', () => ({
  apiGet: vi.fn(),
}));

import { apiGet } from '@/api/client';

const sampleGif = {
  id: 'g1',
  title: 'wave',
  images: {
    downsized: { url: 'https://media.giphy.com/full.webp' },
    fixed_height_small_still: {
      url: 'https://media.giphy.com/thumb.jpg',
    },
    preview_gif: { url: 'https://media.giphy.com/preview.gif' },
  },
};

describe('warmGifCategoryLibrary', () => {
  beforeEach(() => {
    __clearGifSearchCacheForTests();
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiGet).mockResolvedValue([sampleGif]);
  });

  it('prefetches every browse category once', async () => {
    await warmGifCategoryLibrary();

    expect(vi.mocked(apiGet).mock.calls.length).toBe(
      GIF_BROWSE_CATEGORIES.length,
    );
    expect(getCachedGifCategoryResults('trending')?.length).toBeGreaterThan(0);
    expect(getCachedGifCategoryResults('reactions')?.length).toBeGreaterThan(0);
  });

  it('skips network when cache is already warm', async () => {
    await warmGifCategoryLibrary();
    vi.mocked(apiGet).mockClear();

    await warmGifCategoryLibrary();

    expect(vi.mocked(apiGet)).not.toHaveBeenCalled();
  });
});
