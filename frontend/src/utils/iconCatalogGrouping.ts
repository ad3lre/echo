/**
 * Group icon filenames that are alternate versions of the same icon (filled/outline, on/off,
 * -x overlays, numbered exports, stylistic -y alts, etc.) so the picker shows one tile per
 * family and expands variants on demand.
 *
 * Grouping is **filename-only** — we do not collapse unrelated icons by topic (chat vs message,
 * math pack, people bucket, etc.).
 */

import type { IconCatalogEntry } from '@/assets/iconCatalog';
import { sortIconsForChannelPicker } from '@/utils/iconChannelSort';

export interface IconFamilyGroup {
  /** Stable key (lowercase), used for expand/collapse state */
  key: string;
  /** Display label for the family */
  label: string;
  representative: IconCatalogEntry;
  /** All members, sorted for channel type */
  variants: IconCatalogEntry[];
}

/** Trailing `-{modifier}` segments stripped iteratively (right to left). */
const VARIANT_MODIFIERS = new Set(
  [
    'filled',
    'outline',
    'alt',
    'bold',
    'thin',
    'thin-2',
    'on',
    'off',
    'slash',
    'dashed',
    'light',
    'dark',
    'v2',
    'v3',
    'filled-alt',
    'normal',
    'simple',
    'styled',
    'skeleton',
    'skeletion',
    'correct',
    'plus',
    'minus',
    'x',
    'xy',
    'up',
    'down',
    'left',
    'right',
    'center',
    'block',
    'lock',
    'locked',
    'mute',
    'love',
    'heart',
    'star',
    'search',
    'security',
    'settings',
    'time',
    'read',
    'write',
    'danger',
    'info',
    'mark',
    'remove',
    'download',
    'code',
    'trade',
    'tag',
    'eyes',
    'dollar',
    'identify',
    'identifid',
    'identifidy',
    'hand',
    'return',
    'pause',
    'dot',
    'dots',
    'double',
    'long',
    'semi',
    'fat',
    'bigger',
    'big',
    'smaller',
    'vertical',
    'verticle',
    'horizontal',
    'alignment',
    'seperated',
    'seperator',
    'separate',
    'silhouette',
    'friend',
    'friends',
    'group',
    'simpler',
    'two',
    'it',
    'pls',
    'launch',
    'fileld',
    'cricle',
    'cricly',
    'taggy',
    'plussy',
    'minusey',
    'offy',
    'codey',
    'dollary',
    'eyey',
    'searchy',
    'securityy',
    'settingy',
    'starry',
    'timedy',
    'writey',
  ].map((s) => s.toLowerCase()),
);

const NUMERIC_SUFFIX = /-\d+$/i;
const MAX_STRIP_PASSES = 24;

/** Lowercase stem with spaces normalized to hyphens. */
export function normalizeIconStem(filename: string): string {
  return filename
    .replace(/\.svg$/i, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

/** Drop a trailing stylistic `y` only when the remainder is a known modifier (`offy` → `off`). */
function stripStylisticYSegment(segment: string): string | null {
  if (segment.length <= 2 || !segment.endsWith('y')) return null;
  const base = segment.slice(0, -1);
  return VARIANT_MODIFIERS.has(base) ? base : null;
}

function stripOneVariantSegment(stem: string): string {
  const k = stem.replace(NUMERIC_SUFFIX, '');
  const parts = k.split('-');
  if (parts.length <= 1) return k;

  let last = parts[parts.length - 1]!.toLowerCase();
  const stylisticBase = stripStylisticYSegment(last);
  if (stylisticBase) {
    parts[parts.length - 1] = stylisticBase;
    last = stylisticBase;
  }

  if (!VARIANT_MODIFIERS.has(last)) return k;
  return parts.slice(0, -1).join('-');
}

/**
 * Normalize `message-filled`, `USER-AVATAR-X`, `volume up` → shared base keys for true variants.
 * `channelType` is accepted for call-site compatibility but does not affect grouping.
 */
export function getBaseIconGroupKey(
  filename: string,
  _channelType?: 'text' | 'voice',
): string {
  let k = normalizeIconStem(filename);
  for (let i = 0; i < MAX_STRIP_PASSES; i++) {
    const next = stripOneVariantSegment(k);
    if (next === k) break;
    k = next;
  }
  return k;
}

function pickRepresentative(
  key: string,
  variants: IconCatalogEntry[],
): IconCatalogEntry {
  const byExactStem = variants.find((v) => normalizeIconStem(v.id) === key);
  if (byExactStem) return byExactStem;
  return variants
    .slice()
    .sort(
      (a, b) =>
        normalizeIconStem(a.id).length - normalizeIconStem(b.id).length ||
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
    )[0]!;
}

function familyLabel(_key: string, representative: IconCatalogEntry): string {
  const raw = representative.label;
  let simplified = normalizeIconStem(raw);
  for (let i = 0; i < MAX_STRIP_PASSES; i++) {
    const next = stripOneVariantSegment(simplified);
    if (next === simplified) break;
    simplified = next;
  }
  if (simplified.length > 0) {
    return simplified.replace(/-/g, ' ');
  }
  return raw;
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
    const key = getBaseIconGroupKey(e.id);
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
