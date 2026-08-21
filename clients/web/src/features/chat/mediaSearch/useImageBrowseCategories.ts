/**
 * Monthly image browse categories from Google Trends (server-side RSS → GET /image-browse-categories).
 */

import { ref } from 'vue';
import { API_BASE } from '@/config';
import {
  IMAGE_BROWSE_CATEGORIES,
  type MediaBrowseCategory,
} from '@/features/chat/mediaSearch/mediaCategoryLibrary';

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

/** Case-insensitive slug/name dedupe before replacing the picker grid. */
export function dedupeMediaBrowseCategories(
  rows: readonly MediaBrowseCategory[],
): MediaBrowseCategory[] {
  const seenSlugs = new Set<string>();
  const seenNames = new Set<string>();
  const out: MediaBrowseCategory[] = [];
  for (const row of rows) {
    const slugKey = row.slug.toLowerCase().trim();
    const nameKey = row.name.toLowerCase().trim();
    if (!slugKey || seenSlugs.has(slugKey) || seenNames.has(nameKey)) continue;
    seenSlugs.add(slugKey);
    seenNames.add(nameKey);
    out.push(row);
  }
  return out;
}

function applyPayload(payload: ImageBrowseCategoriesPayload) {
  if (payload.categories?.length) {
    categories.value = dedupeMediaBrowseCategories(payload.categories);
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
