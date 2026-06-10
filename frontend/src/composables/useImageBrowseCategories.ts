/**
 * Monthly image browse categories from Google Trends (server-side RSS → GET /image-browse-categories).
 */

import { ref } from 'vue';
import { API_BASE } from '@/config';
import {
  IMAGE_BROWSE_CATEGORIES,
  type MediaBrowseCategory,
} from '@/data/mediaCategoryLibrary';

export type ImageBrowseCategoriesPayload = {
  monthKey: string;
  source: 'google_trends' | 'fallback';
  categories: MediaBrowseCategory[];
};

const categories = ref<MediaBrowseCategory[]>([...IMAGE_BROWSE_CATEGORIES]);
const monthKey = ref<string | null>(null);
const source = ref<'google_trends' | 'fallback' | 'static'>('static');
const loaded = ref(false);

let inflight: Promise<void> | null = null;

function applyPayload(payload: ImageBrowseCategoriesPayload) {
  if (payload.categories?.length) {
    categories.value = payload.categories;
    monthKey.value = payload.monthKey;
    source.value = payload.source;
    loaded.value = true;
  }
}

export async function ensureImageBrowseCategories(
  force = false,
): Promise<void> {
  if (loaded.value && !force) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/image-browse-categories`);
      if (!res.ok) return;
      const payload = (await res.json()) as ImageBrowseCategoriesPayload;
      applyPayload(payload);
    } catch {
      /* keep static fallback */
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function imageCategoryBySlug(
  slug: string,
): MediaBrowseCategory | undefined {
  return categories.value.find((c) => c.slug === slug);
}

export function useImageBrowseCategories() {
  return {
    categories,
    monthKey,
    source,
    loaded,
    ensureImageBrowseCategories,
    imageCategoryBySlug,
  };
}
