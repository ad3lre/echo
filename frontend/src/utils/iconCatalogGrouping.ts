/**
 * Group icon filenames that are the same "family" (numbering, filled/outline, on/off, etc.)
 * so the channel picker can show one tile per family and expand variants on demand.
 *
 * Large semantic buckets (chat/message, voice/video, people) collapse many unrelated filenames
 * into one expandable tile — see {@link resolveSemanticMegaKey}.
 */

import type { IconCatalogEntry } from '@/assets/iconCatalog';
import {
  getChannelIconSortKeys,
  sortIconsForChannelPicker,
} from '@/utils/iconChannelSort';

export interface IconFamilyGroup {
  /** Stable key (lowercase), used for expand/collapse state */
  key: string;
  /** Display label for the family */
  label: string;
  representative: IconCatalogEntry;
  /** All members, sorted for channel type */
  variants: IconCatalogEntry[];
}

const VARIANT_SUFFIX =
  /-(filled|outline|alt|bold|thin|thin-2|on|off|slash|dashed|light|dark|v2|v3|filled-alt)$/i;

const SORT_MAX = 9999;

/** Tier-1 icons that look “people / social” — substring check on filename. */
const PEOPLE_MEGA_SUBSTRINGS = [
  'user',
  'people',
  'group',
  'friend',
  'member',
  'profile',
  'avatar',
  'community',
  'team',
  'invite',
  'person',
] as const;

export type SemanticMegaKey = 'messaging' | 'voice' | 'people';

/**
 * Map many chat-, message-, CHAT-, etc. files into one mega-family (tier-0 chat vs voice from
 * {@link getChannelIconSortKeys}), plus a people bucket for common social avatars.
 */
export function resolveSemanticMegaKey(
  entry: IconCatalogEntry,
  channelType: 'text' | 'voice',
): SemanticMegaKey | null {
  const keys = getChannelIconSortKeys(entry);
  if (keys.tier === 0) {
    if (channelType === 'text') {
      if (keys.chatIdx < SORT_MAX) return 'messaging';
      if (keys.voiceIdx < SORT_MAX) return 'voice';
    } else {
      if (keys.voiceIdx < SORT_MAX) return 'voice';
      if (keys.chatIdx < SORT_MAX) return 'messaging';
    }
    return null;
  }
  if (keys.tier === 1) {
    const fileLower = entry.id.toLowerCase();
    if (PEOPLE_MEGA_SUBSTRINGS.some((s) => fileLower.includes(s))) {
      return 'people';
    }
  }
  return null;
}

const MEGA_LABEL: Record<SemanticMegaKey, string> = {
  messaging: 'Chat & messages',
  voice: 'Voice & video',
  people: 'People & profiles',
};

/**
 * Normalize `message-2`, `message-filled`, `camera-on` → same base as `message`, `camera`.
 * Pass `channelType` so chat/voice/people mega-groups apply (same rules as channel icon sort).
 */
export function getBaseIconGroupKey(
  filename: string,
  channelType?: 'text' | 'voice',
): string {
  if (channelType !== undefined) {
    const entry: IconCatalogEntry = {
      id: filename,
      url: '',
      label: filename.replace(/\.svg$/i, '').trim(),
    };
    const mega = resolveSemanticMegaKey(entry, channelType);
    if (mega) return `__mega_${mega}`;
  }
  const base = filename.replace(/\.svg$/i, '').trim();
  let k = base.replace(/-\d+$/i, '');
  k = k.replace(VARIANT_SUFFIX, '');
  return k.toLowerCase();
}

function pickRepresentative(
  key: string,
  variants: IconCatalogEntry[],
): IconCatalogEntry {
  const exact = `${key}.svg`;
  const byExact = variants.find((v) => v.id.toLowerCase() === exact);
  if (byExact) return byExact;
  return variants[0]!;
}

function familyLabel(key: string, representative: IconCatalogEntry): string {
  const mega = key.match(/^__mega_(messaging|voice|people)$/);
  if (mega) {
    return MEGA_LABEL[mega[1] as SemanticMegaKey];
  }
  const raw = representative.label;
  const simplified = raw
    .replace(/-\d+$/i, '')
    .replace(VARIANT_SUFFIX, '')
    .trim();
  if (simplified.length > 0) return simplified;
  return key;
}

/**
 * Cluster catalog entries by {@link getBaseIconGroupKey}; sort variants per channel type.
 */
export function groupIconCatalogEntries(
  entries: IconCatalogEntry[],
  channelType: 'text' | 'voice',
): IconFamilyGroup[] {
  const map = new Map<string, IconCatalogEntry[]>();
  for (const e of entries) {
    const key = getBaseIconGroupKey(e.id, channelType);
    const list = map.get(key);
    if (list) list.push(e);
    else map.set(key, [e]);
  }

  const sortedEntries = sortIconsForChannelPicker(entries, channelType);
  const rankById = new Map<string, number>();
  sortedEntries.forEach((e, i) => rankById.set(e.id, i));

  const out: IconFamilyGroup[] = [];
  for (const [key, group] of map) {
    const variants = sortIconsForChannelPicker(group, channelType);
    const representative = pickRepresentative(key, variants);
    out.push({
      key,
      label: familyLabel(key, representative),
      representative,
      variants,
    });
  }

  out.sort((a, b) => {
    const ra = rankById.get(a.representative.id) ?? 99999;
    const rb = rankById.get(b.representative.id) ?? 99999;
    if (ra !== rb) return ra - rb;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
  return out;
}
