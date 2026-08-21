/**
 * Recently used emoji (unicode + custom) in localStorage for the picker.
 */

import { ref } from 'vue';
import type { EmojiEntry } from '@/features/chat/emoji/useEmojiData';
import { parseSingleEmoji } from '@/features/chat/emoji/twemoji';
import { customEmojiPickerHtml } from '@/features/chat/emoji/useServerEmojiLibrary';
import { safeCustomEmojiUrl } from '@/features/chat/emoji/customEmojiUrl';

const RECENTLY_USED_KEY = 'echo-emoji-recent-v3';
const LEGACY_KEY = 'echo-emoji-recent-v2';
const RECENTLY_USED_MAX = 30;

/** Corrupt v3 unicode rows saved when custom emoji had no usable imageUrl (treated as unicode). */
function looksLikeCustomEmojiToken(s: string): boolean {
  return /^<a?:[^:\s]+:\d+>$/.test(s.trim());
}

export type RecentEmojiStored =
  | {
      v: 3;
      kind: 'unicode';
      emoji: string;
      name: string;
      slug: string;
      html: string;
    }
  | {
      v: 3;
      kind: 'custom';
      token: string;
      id: string;
      name: string;
      url: string;
      serverId: string;
      animated: boolean;
    };

function toStoredUnicode(entry: EmojiEntry): RecentEmojiStored {
  return {
    v: 3,
    kind: 'unicode',
    emoji: entry.emoji,
    name: entry.name,
    slug: entry.slug,
    html: parseSingleEmoji(entry.emoji),
  };
}

function storedToPickerEntry(
  row: RecentEmojiStored,
  _currentServerId: string | undefined,
): EmojiEntry | null {
  if (row.kind === 'unicode') {
    return {
      emoji: row.emoji,
      name: row.name,
      slug: row.slug,
      html: row.html,
      skin_tone_support: false,
    };
  }
  const imageUrl = safeCustomEmojiUrl(row.url) ?? '';
  return {
    kind: 'custom',
    id: row.id,
    serverId: row.serverId,
    name: row.name,
    slug: `ce-${row.id}`,
    animated: row.animated,
    imageUrl,
    emoji: row.token,
    html: customEmojiPickerHtml(imageUrl, row.name),
    skin_tone_support: false,
  };
}

type LegacyCached = { emoji: string; name: string; slug: string; html: string };

export function loadRecentlyUsed(): RecentEmojiStored[] {
  try {
    const s = localStorage.getItem(RECENTLY_USED_KEY);
    if (s) {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed)) {
        const out: RecentEmojiStored[] = [];
        for (const e of parsed) {
          if (!e || typeof e !== 'object') continue;
          const o = e as Record<string, unknown>;
          if (o.v !== 3) continue;
          if (o.kind === 'unicode') {
            if (
              typeof o.emoji === 'string' &&
              typeof o.name === 'string' &&
              typeof o.slug === 'string'
            ) {
              const emoji = o.emoji;
              if (!emoji) continue;
              if (looksLikeCustomEmojiToken(emoji)) continue;
              out.push({
                v: 3,
                kind: 'unicode',
                emoji,
                name: o.name,
                slug: o.slug,
                html: parseSingleEmoji(emoji),
              });
            }
          } else if (o.kind === 'custom') {
            if (
              typeof o.token === 'string' &&
              typeof o.id === 'string' &&
              typeof o.name === 'string' &&
              typeof o.url === 'string' &&
              typeof o.serverId === 'string' &&
              typeof o.animated === 'boolean'
            ) {
              out.push({
                v: 3,
                kind: 'custom',
                token: o.token,
                id: o.id,
                name: o.name,
                url: o.url,
                serverId: o.serverId,
                animated: o.animated,
              });
            }
          }
        }
        const result = out.slice(-RECENTLY_USED_MAX);
        const serialized = JSON.stringify(result);
        if (serialized !== s) {
          try {
            localStorage.setItem(RECENTLY_USED_KEY, serialized);
          } catch {
            /* ignore */
          }
        }
        return result;
      }
    }

    const leg = localStorage.getItem(LEGACY_KEY);
    if (leg) {
      const parsed = JSON.parse(leg) as unknown;
      if (Array.isArray(parsed)) {
        const out: RecentEmojiStored[] = [];
        for (const e of parsed) {
          const o = e as LegacyCached;
          if (o && typeof o.emoji === 'string') {
            const emoji = o.emoji;
            if (!emoji) continue;
            if (looksLikeCustomEmojiToken(emoji)) continue;
            out.push({
              v: 3,
              kind: 'unicode',
              emoji,
              name: typeof o.name === 'string' ? o.name : emoji,
              slug:
                typeof o.slug === 'string'
                  ? o.slug
                  : `recent-${emoji.codePointAt(0) ?? 0}`,
              html: parseSingleEmoji(emoji),
            });
          }
        }
        return out.slice(-RECENTLY_USED_MAX);
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

/**
 * Single reactive list for all picker instances (composer, reaction popout, etc.) so updates
 * stay in sync and other features (e.g. quick-reaction fallback) can subscribe in the same tab.
 */
export const recentlyUsedEmojiRows =
  ref<RecentEmojiStored[]>(loadRecentlyUsed());

/** Re-read `echo-emoji-recent-v3` into {@link recentlyUsedEmojiRows} (tests / same-tab recovery). */
export function syncRecentlyUsedFromStorage() {
  recentlyUsedEmojiRows.value = loadRecentlyUsed();
}

export function useRecentlyUsedEmojis() {
  function persist(next: RecentEmojiStored[]) {
    recentlyUsedEmojiRows.value = next;
    try {
      localStorage.setItem(RECENTLY_USED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function addRecentlyUsed(emojiOrEntry: string | EmojiEntry) {
    if (typeof emojiOrEntry === 'string') {
      const emoji = emojiOrEntry;
      if (!emoji) return;
      const row: RecentEmojiStored = {
        v: 3,
        kind: 'unicode',
        emoji,
        name: emoji,
        slug: `recent-${emoji.codePointAt(0) ?? 0}`,
        html: parseSingleEmoji(emoji),
      };
      const without = recentlyUsedEmojiRows.value.filter(
        (r) => !(r.kind === 'unicode' && r.emoji === emoji),
      );
      persist([...without, row].slice(-RECENTLY_USED_MAX));
      return;
    }
    const entry = emojiOrEntry;
    if (entry.kind === 'custom') {
      if (
        entry.id &&
        entry.imageUrl?.trim() &&
        entry.serverId != null &&
        entry.animated != null
      ) {
        const row: RecentEmojiStored = {
          v: 3,
          kind: 'custom',
          token: entry.emoji,
          id: entry.id,
          name: entry.name,
          url: entry.imageUrl,
          serverId: entry.serverId,
          animated: entry.animated,
        };
        const without = recentlyUsedEmojiRows.value.filter(
          (r) => !(r.kind === 'custom' && r.id === entry.id),
        );
        persist([...without, row].slice(-RECENTLY_USED_MAX));
      }
      return;
    }
    const row = toStoredUnicode(entry);
    const without = recentlyUsedEmojiRows.value.filter(
      (r) => !(r.kind === 'unicode' && r.emoji === entry.emoji),
    );
    persist([...without, row].slice(-RECENTLY_USED_MAX));
  }

  function recentPickerEntries(
    currentServerId: string | undefined,
  ): EmojiEntry[] {
    const out: EmojiEntry[] = [];
    for (const row of recentlyUsedEmojiRows.value) {
      const e = storedToPickerEntry(row, currentServerId);
      if (e) out.push(e);
    }
    return out;
  }

  return {
    recentlyUsed: recentlyUsedEmojiRows,
    addRecentlyUsed,
    recentPickerEntries,
  };
}
