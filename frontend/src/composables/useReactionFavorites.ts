/**
 * Quick-reaction bar: last 3 distinct reaction emojis (MRU), updated on each successful toggle.
 * If empty, falls back to unicode MRU from the emoji picker (`echo-emoji-recent-v3`), then defaults.
 */

import { ref, computed } from 'vue';
import { parseSingleEmoji } from '@/utils/twemoji';
import {
  recentlyUsedEmojiRows,
  type RecentEmojiStored,
} from '@/composables/useRecentlyUsedEmojis';

const STORAGE_KEY = 'echo-reaction-favorites-v2';
const LEGACY_STORAGE_KEY = 'echo-reaction-favorites-v1';
const TOP_COUNT = 3;

/** Last-resort quick picks when there is no reaction history and no picker unicode recents. */
export const DEFAULT_QUICK_REACTION_EMOJIS = ['👍', '❤️', '😂'] as const;

export interface ReactionFavorite {
  emoji: string;
  html: string;
}

/** Default three emoji row (Twemoji HTML) — only for empty history / missing inject. */
export function defaultQuickReactionFavorites(): ReactionFavorite[] {
  return DEFAULT_QUICK_REACTION_EMOJIS.map((emoji) => ({
    emoji,
    html: parseSingleEmoji(emoji),
  }));
}

/** Picker list is oldest → newest; walk from the end for MRU distinct unicode (custom skipped for quick bar). */
function quickRowFromPickerRecent(
  recent: RecentEmojiStored[],
): ReactionFavorite[] {
  const seen = new Set<string>();
  const out: ReactionFavorite[] = [];
  for (let i = recent.length - 1; i >= 0 && out.length < TOP_COUNT; i--) {
    const row = recent[i]!;
    if (row.kind !== 'unicode') continue;
    if (seen.has(row.emoji)) continue;
    seen.add(row.emoji);
    out.push({
      emoji: row.emoji,
      html:
        row.html && row.html.length > 0
          ? row.html
          : parseSingleEmoji(row.emoji),
    });
  }
  return out;
}

function mruToFavorites(emojis: string[]): ReactionFavorite[] {
  return emojis.slice(0, TOP_COUNT).map((emoji) => ({
    emoji,
    html: parseSingleEmoji(emoji),
  }));
}

function buildTopReactions(
  mru: string[],
  recentPicker: RecentEmojiStored[],
): ReactionFavorite[] {
  if (mru.length === 0) {
    const fromRecent = quickRowFromPickerRecent(recentPicker);
    if (fromRecent.length > 0) return fromRecent;
    return defaultQuickReactionFavorites();
  }
  return mruToFavorites(mru);
}

/** Move `emoji` to front; drop duplicates; cap at {@link TOP_COUNT}. */
function pushReactionMru(current: string[], emoji: string): string[] {
  const without = current.filter((e) => e !== emoji);
  return [emoji, ...without].slice(0, TOP_COUNT);
}

/** Legacy v1 entry shapes; used only for one-time migration. */
interface LegacyEntry {
  emoji: string;
  count?: number;
  lastUsedAt?: number;
  uses?: number;
}

function legacyEntryLastUsedAt(e: LegacyEntry): number {
  if (typeof e.lastUsedAt === 'number') return e.lastUsedAt;
  return 0;
}

function migrateV1ToMru(parsed: unknown): string[] | null {
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const first = parsed[0];
  if (typeof first === 'string') return null;
  const rows: LegacyEntry[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const o = item as LegacyEntry;
    if (typeof o.emoji !== 'string') continue;
    rows.push(o);
  }
  if (rows.length === 0) return null;
  const sorted = [...rows].sort(
    (a, b) => legacyEntryLastUsedAt(b) - legacyEntryLastUsedAt(a),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of sorted) {
    if (seen.has(r.emoji)) continue;
    seen.add(r.emoji);
    out.push(r.emoji);
    if (out.length >= TOP_COUNT) break;
  }
  return out;
}

function load(): string[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        const list = parsed as string[];
        return list.slice(0, TOP_COUNT);
      }
    }

    const leg = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (leg) {
      const migrated = migrateV1ToMru(JSON.parse(leg) as unknown);
      if (migrated && migrated.length > 0) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        return migrated;
      }
    }

    return [];
  } catch {
    return [];
  }
}

function save(mru: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mru));
  } catch {
    /* ignore */
  }
}

export function useReactionFavorites() {
  const mru = ref<string[]>(load());

  const topReactions = computed<ReactionFavorite[]>(() =>
    buildTopReactions(mru.value, recentlyUsedEmojiRows.value),
  );

  function recordReaction(emoji: string) {
    if (!emoji) return;
    const next = pushReactionMru(mru.value, emoji);
    mru.value = next;
    save(next);
  }

  /** Drop one emoji from the quick-react MRU (e.g. right‑click remove). */
  function removeReactionFavorite(emoji: string) {
    if (!emoji) return;
    const next = mru.value.filter((e) => e !== emoji);
    if (next.length === mru.value.length) return;
    mru.value = next;
    save(next);
  }

  return { topReactions, recordReaction, removeReactionFavorite };
}
