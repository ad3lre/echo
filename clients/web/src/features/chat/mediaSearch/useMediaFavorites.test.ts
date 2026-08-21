import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useMediaFavorites,
  gifToMediaFavorite,
  imageToMediaFavorite,
} from '@/features/chat/mediaSearch/useMediaFavorites';
import type { GifResult } from '@/features/chat/mediaSearch/useGifSearch';

const STORAGE_KEY = 'echo-media-favorites-v1';

function memoryLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
}

describe('useMediaFavorites', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryLocalStorage());
    localStorage.clear();
  });

  it('persists toggle and reload', () => {
    const gif: GifResult = {
      id: 'abc',
      url: 'https://media.giphy.com/full.gif',
      thumbnailUrl: 'https://media.giphy.com/thumb.gif',
      previewUrl: 'https://media.giphy.com/preview.gif',
      previewMp4Url: null,
      title: 'wave',
    };
    const entry = gifToMediaFavorite(gif);
    const a = useMediaFavorites();
    expect(a.isFavorite(entry.id)).toBe(false);
    a.toggleFavorite(entry);
    expect(a.isFavorite(entry.id)).toBe(true);
    expect(a.gifFavorites.value).toHaveLength(1);

    const b = useMediaFavorites();
    expect(b.isFavorite(entry.id)).toBe(true);
    b.toggleFavorite(entry);
    expect(b.isFavorite(entry.id)).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('[]');
  });

  it('keeps gif and image favorites separate by kind', () => {
    const { toggleFavorite, gifFavorites, imageFavorites } =
      useMediaFavorites();
    toggleFavorite(
      imageToMediaFavorite({
        id: 'img1',
        url: 'https://example.com/a.jpg',
        thumbUrl: 'https://example.com/a-t.jpg',
        alt: 'cat',
      }),
    );
    toggleFavorite(
      gifToMediaFavorite({
        id: 'g1',
        url: 'https://giphy.com/x.gif',
        thumbnailUrl: 'https://giphy.com/x-t.gif',
        previewUrl: 'https://giphy.com/x-p.gif',
        previewMp4Url: null,
        title: 'hi',
      }),
    );
    expect(gifFavorites.value).toHaveLength(1);
    expect(imageFavorites.value).toHaveLength(1);
  });
});
