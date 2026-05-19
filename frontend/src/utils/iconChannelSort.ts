/**
 * Sort order for channel icon picker: **semantic fit for text chat vs voice** first,
 * **A–Z by label** second.
 *
 * Tiers (primary → secondary):
 * - **Tier 0 — Chat / voice core**: filename matches ordered keyword lists for messaging vs audio/VC.
 * - **Tier 1 — Server / social / meta**: users, community, settings, pins, announcements-ish, etc.
 * - **Tier 2 — Everything else**: alphabetical only.
 *
 * Within tier 0, when picking for a **text** channel we rank **chat keywords** first (lower index =
 * more on-brand), then voice. For **voice** channels we rank **voice keywords** first, then chat.
 */

import type { IconCatalogEntry } from '@/assets/iconCatalog';

/** Most → least relevant for *text / chat* channel icons (substring match on filename). */
export const CHAT_KEYWORD_ORDER = [
  'message',
  'chat',
  'comment',
  'hashtag',
  'reply',
  'bubble',
  'compose',
  'mail',
  'send',
  'text',
  'forum',
  'emoji',
  'emote',
  'gif',
  'quote',
  'thread',
  'typing',
  'edit',
  'write',
  'note',
  'document',
  'keyboard',
  'pin',
  'thumbtack',
  'announcement',
  'news',
  'bell',
  'notification',
  'list',
  'inbox',
  'paper',
  'letter',
  'bookmark',
] as const;

/** Most → least relevant for *voice / VC* channel icons. */
export const VOICE_KEYWORD_ORDER = [
  'volume',
  'mic',
  'micro',
  'speaker',
  'headphone',
  'headset',
  'sound',
  'audio',
  'voice',
  'call',
  'phone',
  'record',
  'stream',
  'broadcast',
  'listen',
  'mute',
  'unmute',
  'podcast',
  'radio',
  'sing',
  'music',
  'camera',
  'video',
  'webcam',
  'desktop',
  'screen',
  'chromecast',
  'tv',
  'play',
  'pause',
  'fast forward',
  'rewind',
  'playlist',
] as const;

/** Good for channels but not specifically “bubble vs mic” — ranked after tier 0. */
export const SECONDARY_KEYWORD_ORDER = [
  'user',
  'people',
  'group',
  'community',
  'friend',
  'invite',
  'team',
  'member',
  'profile',
  'avatar',
  'settings',
  'gear',
  'sliders',
  'lock',
  'shield',
  'security',
  'star',
  'heart',
  'rocket',
  'megaphone',
  'calendar',
  'folder',
  'flag',
  'crown',
  'globe',
  'compass',
  'map',
  'home',
  'fire',
  'sparkle',
  'check',
  'plus',
  'search',
  'filter',
  'sort',
  'tag',
  'link',
  'share',
  'import',
  'export',
  'database',
  'chart',
  'tool',
  'puzzle',
  'game',
  'coffee',
  'mug',
  'food',
  'restaurant',
  'leaf',
  'sun',
  'moon',
] as const;

const MAX = 9999;

/** Tokens that start with a voice prefix but are not audio-related (substring false positives). */
const VOICE_TOKEN_DENYLIST = new Set(['microsoft', 'microwave', 'micrometer']);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phraseInStem(stem: string, phrase: string): boolean {
  const parts = phrase.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  const re = new RegExp(parts.map(escapeRegExp).join('[^a-z0-9]+'), 'i');
  return re.test(stem);
}

/**
 * Match a single keyword against one filename token (split on [-_.\s]+).
 * Avoids `chateau` matching `chat`, and `microsoft` matching `micro`.
 */
function tokenMatchesKeyword(token: string, kw: string): boolean {
  if (kw === 'micro' && VOICE_TOKEN_DENYLIST.has(token)) return false;
  if (token === kw) return true;
  if (token.startsWith(`${kw}-`) || token.startsWith(`${kw}_`)) return true;
  if (kw.length <= 3) {
    return token === `${kw}s` || token === `${kw}es`;
  }
  if (token === `${kw}s` || token === `${kw}es`) return true;
  if (token.startsWith(`${kw}ing`) || token.startsWith(`${kw}ed`)) return true;
  if (kw.length >= 5 && token.startsWith(kw)) return true;
  return false;
}

function bestKeywordIndex(
  fileLower: string,
  keywords: readonly string[],
): number {
  const stem = fileLower.replace(/\.svg$/i, '');
  const tokens = stem.split(/[^a-z0-9]+/i).filter(Boolean);
  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i]!;
    if (/\s/.test(kw)) {
      if (phraseInStem(stem, kw)) return i;
      continue;
    }
    if (tokens.some((t) => tokenMatchesKeyword(t, kw))) return i;
  }
  return MAX;
}

export interface ChannelIconSortKeys {
  tier: 0 | 1 | 2;
  chatIdx: number;
  voiceIdx: number;
  secondaryIdx: number;
  label: string;
}

export function getChannelIconSortKeys(
  entry: IconCatalogEntry,
): ChannelIconSortKeys {
  const fileLower = entry.id.toLowerCase();
  const chatIdx = bestKeywordIndex(fileLower, CHAT_KEYWORD_ORDER);
  const voiceIdx = bestKeywordIndex(fileLower, VOICE_KEYWORD_ORDER);
  const secondaryIdx = bestKeywordIndex(fileLower, SECONDARY_KEYWORD_ORDER);

  const inCore = chatIdx < MAX || voiceIdx < MAX;
  const tier: 0 | 1 | 2 = inCore ? 0 : secondaryIdx < MAX ? 1 : 2;

  return {
    tier,
    chatIdx,
    voiceIdx,
    secondaryIdx,
    label: entry.label,
  };
}

function compareByChannelType(
  a: ChannelIconSortKeys,
  b: ChannelIconSortKeys,
  channelType: 'text' | 'voice',
): number {
  if (a.tier !== b.tier) return a.tier - b.tier;

  if (a.tier === 0) {
    if (channelType === 'text') {
      if (a.chatIdx !== b.chatIdx) return a.chatIdx - b.chatIdx;
      if (a.voiceIdx !== b.voiceIdx) return a.voiceIdx - b.voiceIdx;
    } else {
      if (a.voiceIdx !== b.voiceIdx) return a.voiceIdx - b.voiceIdx;
      if (a.chatIdx !== b.chatIdx) return a.chatIdx - b.chatIdx;
    }
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  }

  if (a.tier === 1) {
    if (a.secondaryIdx !== b.secondaryIdx)
      return a.secondaryIdx - b.secondaryIdx;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  }

  return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
}

/** Stable semantic + alphabetical ordering for the channel icon picker. */
export function sortIconsForChannelPicker(
  entries: IconCatalogEntry[],
  channelType: 'text' | 'voice',
): IconCatalogEntry[] {
  const withKeys = entries.map((e) => ({
    entry: e,
    keys: getChannelIconSortKeys(e),
  }));
  withKeys.sort((x, y) => compareByChannelType(x.keys, y.keys, channelType));
  return withKeys.map((x) => x.entry);
}
