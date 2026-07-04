/**
 * Searchable index of **all** SVG icons under `assets/icons/` (Vite glob), plus search helpers.
 * Default list order uses semantic ranking for chat/voice (see `iconChannelSort`).
 * Sort/group results are memoized per channel type since the catalog is immutable at runtime.
 */

import {
  getAllIconCatalogEntries,
  type IconCatalogEntry,
} from '@/assets/iconCatalog';
import { linkTokenAppIcon } from '@/utils/idTokens';
import type { EmojiEntry } from '@/composables/useEmojiData';
import { escapeHtml } from '@/composables/useEmojiData';
import { sortIconsForChannelPicker } from '@/utils/iconChannelSort';
import {
  groupIconCatalogEntries,
  type IconFamilyGroup,
} from '@/utils/iconCatalogGrouping';

export type AppIconEntry = IconCatalogEntry;
export type { IconFamilyGroup };
export { groupIconCatalogEntries };

/** Stable slug for `:slug` autocomplete (from catalog filename, e.g. `volume up.svg` → `volume_up`). */
export function iconSlugFromCatalogId(filename: string): string {
  const stem = filename.replace(/\.svg$/i, '').trim();
  return (
    stem
      .replace(/\s+/g, '_')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '') || 'icon'
  );
}

/** `:slug` autocomplete rows for in-house icons (catalog must be loaded for URLs). */
export function appIconEntriesForAutocompleteQuery(
  query: string,
  limit = 2,
): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits = searchAppIcons(q, 'text', 80);
  return hits.slice(0, limit).map((e) => ({
    emoji: linkTokenAppIcon(e.id),
    skin_tone_support: false,
    name: e.label,
    slug: iconSlugFromCatalogId(e.id),
    html: `<img class="emoji app-inline-icon" draggable="false" alt="" src="${escapeHtml(e.url)}" />`,
    kind: 'appIcon' as const,
    iconFilename: e.id,
  }));
}

/** Bust memoization when sort/grouping rules change. */
const PICKER_CACHE_VER = 'v7-aggressive-grouping';

const sortedCache = new Map<string, AppIconEntry[]>();
const groupedCache = new Map<string, IconFamilyGroup[]>();

function sortCacheKey(channelType: 'text' | 'voice'): string {
  return `${channelType}:${PICKER_CACHE_VER}`;
}

export function getAllAppIcons(
  channelType: 'text' | 'voice' = 'text',
): AppIconEntry[] {
  const k = sortCacheKey(channelType);
  const hit = sortedCache.get(k);
  if (hit) return hit;
  const result = sortIconsForChannelPicker(
    getAllIconCatalogEntries(),
    channelType,
  );
  sortedCache.set(k, result);
  return result;
}

/** Memoized grouped + sorted icon families for the channel icon picker. */
export function getGroupedAppIcons(
  channelType: 'text' | 'voice',
): IconFamilyGroup[] {
  const k = sortCacheKey(channelType);
  const hit = groupedCache.get(k);
  if (hit) return hit;
  const entries = getAllAppIcons(channelType);
  const result = groupIconCatalogEntries(entries, channelType);
  groupedCache.set(k, result);
  return result;
}

/** Multi-token AND search over filename + label; results sorted for channel type, then A–Z as tiebreaker. */
export function searchAppIcons(
  query: string,
  channelType: 'text' | 'voice',
  limit = 800,
): AppIconEntry[] {
  const all = getAllIconCatalogEntries();
  const q = query.trim().toLowerCase();
  const filtered = !q
    ? all
    : all.filter((e) => {
        const tokens = q.split(/\s+/).filter((t) => t.length > 0);
        const hay = `${e.id} ${e.label}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      });
  const sorted = sortIconsForChannelPicker(filtered, channelType);
  return sorted.slice(0, limit);
}

/** Search hits as semantic families (same mega-groups as browse). */
export function getSearchGroupedAppIcons(
  query: string,
  channelType: 'text' | 'voice',
  limit = 800,
): IconFamilyGroup[] {
  return groupIconCatalogEntries(
    searchAppIcons(query, channelType, limit),
    channelType,
  );
}
