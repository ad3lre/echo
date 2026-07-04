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

/** Decorative / state suffixes stripped when inferring a family stem. */
const VARIANT_SUFFIX =
  /-(filled|outline|alt|bold|thin|thin-2|on|off|slash|dashed|light|dark|v2|v3|filled-alt|normal|styled|simple|skeleton|skeletion|straight|curved|long|small|big|empty|center|right|left|double|seperated|separate|vertical|horizontal|plus|minus|x|correct|download|upload|remove|return|alignment|launch|charged|full|half-full|hot|code|pls|verticle|dots|seperate|outbound|against|into|from|through|in-a-circle|in-a-taggy|skeleton-smaller|smaller|stylish|vertically|seperately|alignment-right|alignment-left|right-alignment|left-alignment|right-center|center-right|filled-pls|normal-plus|normal-minus|dot-dot-dot|skeletion)$/i;

const SORT_MAX = 9999;

/**
 * Longest match first. Collapses large variant packs (USER-AVATAR-*, arrow-*, etc.).
 * Icons already assigned to a tier-0 mega (chat/voice) or pattern mega skip this via call order.
 */
const DENSE_FAMILY_PREFIXES = [
  'users-avatar',
  'user-avatar',
  'more-information-in-a-circle',
  'more-information-dots',
  'more-information-seperate',
  'more-information',
  'more-info',
  'left-and-right-arrows',
  'up-and-down-arrows',
  'up-and-down-arrow',
  'down-left-arrow',
  'up-left-arrow',
  'up-right-arrow',
  'game-controller',
  'cross-mark',
  'sim-card',
  'hard-drive',
  'floppy-disk',
  'energy-bolt',
  'rocket-launch',
  'menu-burger-stylish',
  'menu-burger',
  'menu-circle',
  'menu-filled',
  'menu-skeleton',
  'menu-bruger',
  'menu-right',
  'angle-double-small',
  'angle-double',
  'angle-down-double',
  'angle-up-double',
  'arrow-down-from-seperator',
  'arrow-down-into-seperator',
  'arrow-left-against-seperator',
  'arrow-left-into-seperator',
  'arrow-left-outbound-from-seperator',
  'arrow-right-into-seperator',
  'arrow-up-out-of-seperator',
  'arrow-left',
  'arrow-right',
  'arrow-down',
  'arrow-up',
  'arrow-to',
  'turn-down',
  'turn-left',
  'turn-right',
  'turn-up',
  'notifications',
  'notification',
  'christmas-tree',
  'multiple-users-silhouette',
  'users',
  'user',
  'trash',
  'angle',
  'arrow',
  'image',
  'menu',
  'turn',
  'battery',
  'search',
  'sliders',
  'rocket',
  'music',
  'pen',
  'map',
  'rotate',
  'laptop',
  'mug',
  'minus',
  'plus',
  'print',
  'settings',
  'crown',
  'check',
  'more',
  'echo',
  'globe',
  'folder',
  'calendar',
  'shield',
  'star',
  'heart',
  'filter',
  'edit',
  'copy',
  'download',
  'export',
  'import',
  'link',
  'tag',
  'flag',
  'code',
  'brush',
  'palette',
  'scissors',
  'tool',
  'plug',
  'server',
  'database',
  'phone',
  'mail',
  'comment',
  'hashtag',
  'keyboard',
  'desktop',
  'mobile',
  'tablet',
  'tv',
  'watch',
  'sun',
  'moon',
  'fire',
  'sparkle',
  'leaf',
  'puzzle',
  'headphones',
  'speaker',
  'radio',
  'stream',
  'playlist',
  'sort',
  'bell',
  'lock',
  'gift',
  'coupon',
  'nut',
  'film',
  'play',
  'pause',
  'stop',
  'forward',
  'backward',
  'game',
  'flashlight',
  'cpu',
  'disc',
  'compass',
  'store',
  'package',
  'inbox',
  'file',
  'list',
  'layer',
] as const;

const PEOPLE_MEGA_KEYWORDS = [
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

export function normalizeIconStem(filename: string): string {
  return filename
    .replace(/\.svg$/i, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function stemTokens(stem: string): string[] {
  return stem.split(/[^a-z0-9]+/i).filter(Boolean);
}

function tokenMatchesPeopleKeyword(token: string, kw: string): boolean {
  if (token === kw) return true;
  if (token.startsWith(`${kw}-`) || token.startsWith(`${kw}_`)) return true;
  if (kw.length <= 3) {
    return token === `${kw}s` || token === `${kw}es`;
  }
  if (token === `${kw}s` || token === `${kw}es`) return true;
  if (kw.length >= 5 && token.startsWith(kw)) return true;
  return false;
}

/** Collapse dense variant packs into one picker family per prefix. */
export function resolveDenseFamilyPrefix(filename: string): string | null {
  const stem = normalizeIconStem(filename);
  for (const prefix of DENSE_FAMILY_PREFIXES) {
    if (stem === prefix || stem.startsWith(`${prefix}-`)) return prefix;
  }
  return null;
}

function matchesPeopleMegaKeyword(filename: string): boolean {
  const stem = normalizeIconStem(filename);
  if (resolveDenseFamilyPrefix(filename)) return false;
  const tokens = stemTokens(stem);
  return PEOPLE_MEGA_KEYWORDS.some((kw) =>
    tokens.some((t) => tokenMatchesPeopleKeyword(t, kw)),
  );
}

/** Strip trailing numeric / decorative suffixes until stable. */
export function stripVariantSuffixes(stem: string): string {
  let k = stem;
  let prev = '';
  while (k !== prev) {
    prev = k;
    k = k.replace(/-\d+$/i, '').replace(VARIANT_SUFFIX, '');
  }
  return k;
}

export type SemanticMegaKey =
  | 'messaging'
  | 'voice'
  | 'people'
  | 'math'
  | 'hobbies'
  | 'navigation'
  | 'images'
  | 'power'
  | 'controls'
  | 'devices'
  | 'brand'
  | 'trash'
  | 'food'
  | 'doors'
  | 'log';

const PACK_PREFIX_MEGA: Record<string, SemanticMegaKey> = {
  'math-': 'math',
  'hobby-': 'hobbies',
};

const NAVIGATION_STEMS = new Set([
  'arrows',
  'forward',
  'backward',
  'fast-forward',
  'fast-backward',
  'step-forward',
  'step-backward',
  'expand-arrows',
  'expand',
  'compress',
  'maximize',
  'minimize',
  'eject',
  'shuffle',
  'repeat',
  'move-button',
]);

function isNavigationStem(stem: string): boolean {
  if (NAVIGATION_STEMS.has(stem)) return true;
  if (/^(arrow|angle|turn|rotate|repeat)(-|$)/.test(stem)) return true;
  if (
    /^(up|down|left|right)(-|$)/.test(stem) &&
    (/arrow|arrows|seperator|skeleton|straight|curved|long|separated/.test(
      stem,
    ) ||
      /^(down|up|left|right)-(left|right|straight)$/.test(stem))
  ) {
    return true;
  }
  if (stem.includes('and-right-arrows') || stem.includes('and-down-arrow')) {
    return true;
  }
  return false;
}

function isImageStem(stem: string): boolean {
  return (
    stem === 'image' ||
    stem.startsWith('image-') ||
    stem.startsWith('film') ||
    stem.includes('photo') ||
    stem.includes('gallery')
  );
}

function isPowerStem(stem: string): boolean {
  return (
    stem.startsWith('battery') ||
    stem.includes('energy-bolt') ||
    stem === 'bolt' ||
    stem === 'fire'
  );
}

function isControlsStem(stem: string): boolean {
  return (
    stem.startsWith('menu') ||
    stem.startsWith('more') ||
    stem.startsWith('sliders') ||
    stem.startsWith('slider') ||
    stem.startsWith('nut')
  );
}

function isFoodStem(stem: string): boolean {
  return (
    stem.startsWith('restaurant') ||
    stem.startsWith('food-') ||
    stem === 'cake' ||
    stem === 'coffee'
  );
}

function isDoorsStem(stem: string): boolean {
  return stem === 'open-doors' || stem === 'close-doors';
}

function isLogStem(stem: string): boolean {
  return stem === 'log-in' || stem === 'log-out';
}

function isDeviceStem(stem: string): boolean {
  return /^(laptop|mobile|desktop|tablet|tv|watch|cpu|hard-drive|sim-card|usb-drive|sd-card|wireless-symbol|chromecast|mouse)(-|$)/.test(
    stem,
  );
}

function isBrandStem(stem: string): boolean {
  return (
    stem.startsWith('echo') ||
    stem.startsWith('discord') ||
    stem === 'google' ||
    stem === 'youtube'
  );
}

function isTrashStem(stem: string): boolean {
  return stem.startsWith('trash');
}

/** Pattern mega-groups for tier-3 clusters not covered by chat/voice/people. */
function resolvePatternMegaKey(filename: string): SemanticMegaKey | null {
  const stem = normalizeIconStem(filename);
  if (isNavigationStem(stem)) return 'navigation';
  if (isImageStem(stem)) return 'images';
  if (isPowerStem(stem)) return 'power';
  if (isControlsStem(stem)) return 'controls';
  if (isDeviceStem(stem)) return 'devices';
  if (isBrandStem(stem)) return 'brand';
  if (isTrashStem(stem)) return 'trash';
  if (isFoodStem(stem)) return 'food';
  if (isDoorsStem(stem)) return 'doors';
  if (isLogStem(stem)) return 'log';
  return null;
}

function resolvePackMegaKey(entry: IconCatalogEntry): SemanticMegaKey | null {
  const stem = entry.id.replace(/\.svg$/i, '').toLowerCase();
  for (const [prefix, mega] of Object.entries(PACK_PREFIX_MEGA)) {
    if (stem.startsWith(prefix)) return mega;
  }
  return null;
}

export function resolveSemanticMegaKey(
  entry: IconCatalogEntry,
  channelType: 'text' | 'voice',
): SemanticMegaKey | null {
  const pack = resolvePackMegaKey(entry);
  if (pack) return pack;
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
  if (keys.tier === 2 && matchesPeopleMegaKeyword(entry.id)) {
    return 'people';
  }
  return resolvePatternMegaKey(entry.id);
}

const MEGA_LABEL: Record<SemanticMegaKey, string> = {
  messaging: 'Chat & messages',
  voice: 'Voice & video',
  people: 'People & profiles',
  math: 'Math & science',
  hobbies: 'Hobbies & fun',
  navigation: 'Arrows & navigation',
  images: 'Photos & images',
  power: 'Power & battery',
  controls: 'Menus & controls',
  devices: 'Devices & hardware',
  brand: 'Echo & brand',
  trash: 'Trash & delete',
  food: 'Food & dining',
  doors: 'Doors',
  log: 'Sign in & out',
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
    const packMega = resolvePackMegaKey(entry);
    if (packMega) return `__mega_${packMega}`;
    const mega = resolveSemanticMegaKey(entry, channelType);
    if (mega) return `__mega_${mega}`;
    const dense = resolveDenseFamilyPrefix(filename);
    if (dense) return dense;
  }
  return stripVariantSuffixes(normalizeIconStem(filename));
}

function pickRepresentative(
  key: string,
  variants: IconCatalogEntry[],
): IconCatalogEntry {
  const exact = `${key}.svg`;
  const byExact = variants.find((v) => v.id.toLowerCase() === exact);
  if (byExact) return byExact;
  const stemExact = variants.find(
    (v) => normalizeIconStem(v.id) === normalizeIconStem(key),
  );
  if (stemExact) return stemExact;
  return variants[0]!;
}

function familyLabel(key: string, representative: IconCatalogEntry): string {
  const mega = key.match(
    /^__mega_(messaging|voice|people|math|hobbies|navigation|images|power|controls|devices|brand|trash|food|doors|log)$/,
  );
  if (mega) {
    return MEGA_LABEL[mega[1] as SemanticMegaKey];
  }
  const simplified = stripVariantSuffixes(
    normalizeIconStem(representative.label),
  ).replace(/-/g, ' ');
  if (simplified.length > 0) {
    return simplified.charAt(0).toUpperCase() + simplified.slice(1);
  }
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
