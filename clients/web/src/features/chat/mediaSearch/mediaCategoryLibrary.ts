/**
 * Curated GIF / image browse categories (Discord-style picker landing).
 * Queries map to Giphy search terms or Serper image search terms.
 */

export type MediaBrowseCategory = {
  slug: string;
  name: string;
  /** Empty string = trending (GIF) or curated default (image). */
  query: string;
  navEmoji: string;
};

/** First GIF picker view — preview tiles preload when the picker opens via {@link warmGifCategoryLibrary}. */
export const GIF_BROWSE_CATEGORIES: readonly MediaBrowseCategory[] = [
  { slug: 'trending', name: 'Trending', query: '', navEmoji: '🔥' },
  { slug: 'reactions', name: 'Reactions', query: 'reactions', navEmoji: '😂' },
  { slug: 'love', name: 'Love', query: 'love heart', navEmoji: '❤️' },
  {
    slug: 'celebrate',
    name: 'Celebrate',
    query: 'celebration party',
    navEmoji: '🎉',
  },
  { slug: 'gaming', name: 'Gaming', query: 'gaming', navEmoji: '🎮' },
  { slug: 'anime', name: 'Anime', query: 'anime', navEmoji: '✨' },
  { slug: 'sports', name: 'Sports', query: 'sports', navEmoji: '⚽' },
  { slug: 'tv', name: 'TV & Movies', query: 'tv show', navEmoji: '📺' },
] as const;

/**
 * Image picker fallback categories when Google Trends is unavailable.
 * Live picker uses GET /api/v1/image-browse-categories (refreshed monthly).
 * Favorites is handled separately in the UI.
 */
export const IMAGE_BROWSE_CATEGORIES: readonly MediaBrowseCategory[] = [
  { slug: 'nature', name: 'Nature', query: 'nature landscape', navEmoji: '🌿' },
  { slug: 'space', name: 'Space', query: 'space galaxy', navEmoji: '🌌' },
  { slug: 'food', name: 'Food', query: 'food photography', navEmoji: '🍕' },
  {
    slug: 'architecture',
    name: 'Architecture',
    query: 'architecture',
    navEmoji: '🏛️',
  },
  { slug: 'animals', name: 'Animals', query: 'cute animals', navEmoji: '🐾' },
  {
    slug: 'tech',
    name: 'Technology',
    query: 'technology workspace',
    navEmoji: '💻',
  },
  { slug: 'art', name: 'Art', query: 'digital art', navEmoji: '🎨' },
  {
    slug: 'travel',
    name: 'Travel',
    query: 'travel destination',
    navEmoji: '✈️',
  },
] as const;

export function gifCategoryBySlug(
  slug: string,
): MediaBrowseCategory | undefined {
  return GIF_BROWSE_CATEGORIES.find((c) => c.slug === slug);
}

export function imageCategoryBySlug(
  slug: string,
): MediaBrowseCategory | undefined {
  return IMAGE_BROWSE_CATEGORIES.find((c) => c.slug === slug);
}
