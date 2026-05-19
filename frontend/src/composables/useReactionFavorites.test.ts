import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/utils/twemoji', () => ({
  parseSingleEmoji: (emoji: string) =>
    `<span data-test-emoji="${emoji}"></span>`,
}));

import {
  useReactionFavorites,
  DEFAULT_QUICK_REACTION_EMOJIS,
  defaultQuickReactionFavorites,
} from '@/composables/useReactionFavorites';
import { syncRecentlyUsedFromStorage } from '@/composables/useRecentlyUsedEmojis';

const STORAGE_KEY = 'echo-reaction-favorites-v2';
const LEGACY_STORAGE_KEY = 'echo-reaction-favorites-v1';
const RECENTLY_USED_KEY = 'echo-emoji-recent-v3';

beforeEach(() => {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
  });
  syncRecentlyUsedFromStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('defaultQuickReactionFavorites', () => {
  it('returns three default emojis', () => {
    const row = defaultQuickReactionFavorites();
    expect(row).toHaveLength(3);
    expect(row.map((r) => r.emoji)).toEqual([...DEFAULT_QUICK_REACTION_EMOJIS]);
  });
});

describe('useReactionFavorites', () => {
  it('exposes three default quick reactions when storage is empty', () => {
    const { topReactions } = useReactionFavorites();
    expect(topReactions.value).toHaveLength(3);
    expect(topReactions.value.map((r) => r.emoji)).toEqual([
      ...DEFAULT_QUICK_REACTION_EMOJIS,
    ]);
  });

  it('shows only recorded emoji(s) once the user has history (no default padding)', () => {
    const { topReactions, recordReaction } = useReactionFavorites();
    recordReaction('🔥');
    expect(topReactions.value.map((r) => r.emoji)).toEqual(['🔥']);
  });

  it('shows recorded default emoji when it is the only history', () => {
    const { topReactions, recordReaction } = useReactionFavorites();
    recordReaction('👍');
    expect(topReactions.value.map((r) => r.emoji)).toEqual(['👍']);
  });

  it('orders by most-recent reaction first (MRU)', () => {
    const { topReactions, recordReaction } = useReactionFavorites();
    recordReaction('🔥');
    recordReaction('🎉');
    recordReaction('🎉');
    expect(topReactions.value.map((r) => r.emoji)).toEqual(['🎉', '🔥']);
  });

  it('moves a repeated emoji to the front without duplicating', () => {
    const { topReactions, recordReaction } = useReactionFavorites();
    recordReaction('🔥');
    recordReaction('🎉');
    recordReaction('😎');
    recordReaction('🔥');
    expect(topReactions.value.map((r) => r.emoji)).toEqual(['🔥', '😎', '🎉']);
  });

  it('keeps at most three distinct emojis in MRU order', () => {
    const { topReactions, recordReaction } = useReactionFavorites();
    recordReaction('a');
    recordReaction('b');
    recordReaction('c');
    recordReaction('d');
    expect(topReactions.value.map((r) => r.emoji)).toEqual(['d', 'c', 'b']);
  });

  it('removeReactionFavorite drops one emoji and persists', () => {
    const { topReactions, recordReaction, removeReactionFavorite } =
      useReactionFavorites();
    recordReaction('🔥');
    recordReaction('🎉');
    removeReactionFavorite('🔥');
    expect(topReactions.value.map((r) => r.emoji)).toEqual(['🎉']);
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify(['🎉']),
    );
  });

  it('loads MRU from v2 storage (newest-first string array)', () => {
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(['🎉', '🔥', '😎']),
    );
    const { topReactions } = useReactionFavorites();
    expect(topReactions.value.map((r) => r.emoji)).toEqual(['🎉', '🔥', '😎']);
  });

  it('migrates v1 object storage to MRU by lastUsedAt', () => {
    globalThis.localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify([
        { emoji: '🎉', lastUsedAt: 300, uses: 5 },
        { emoji: '🔥', lastUsedAt: 200, uses: 3 },
        { emoji: '😎', lastUsedAt: 100, uses: 1 },
        { emoji: '❤️', lastUsedAt: 50, uses: 1 },
      ]),
    );
    const { topReactions } = useReactionFavorites();
    expect(topReactions.value.map((r) => r.emoji)).toEqual(['🎉', '🔥', '😎']);
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify(['🎉', '🔥', '😎']),
    );
    expect(globalThis.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it('falls back to picker unicode MRU when reaction storage is empty', () => {
    const unicodeRow = (emoji: string) => ({
      v: 3 as const,
      kind: 'unicode' as const,
      emoji,
      name: emoji,
      slug: `s-${emoji}`,
      html: `<span data-test-emoji="${emoji}"></span>`,
    });
    globalThis.localStorage.setItem(
      RECENTLY_USED_KEY,
      JSON.stringify([unicodeRow('😀'), unicodeRow('🔥')]),
    );
    syncRecentlyUsedFromStorage();
    const { topReactions } = useReactionFavorites();
    expect(topReactions.value.map((r) => r.emoji)).toEqual(['🔥', '😀']);
  });

  it('prefers stored reaction MRU over picker recents when both exist', () => {
    const unicodeRow = (emoji: string) => ({
      v: 3 as const,
      kind: 'unicode' as const,
      emoji,
      name: emoji,
      slug: `s-${emoji}`,
      html: `<span data-test-emoji="${emoji}"></span>`,
    });
    globalThis.localStorage.setItem(
      RECENTLY_USED_KEY,
      JSON.stringify([unicodeRow('😀'), unicodeRow('🎊')]),
    );
    syncRecentlyUsedFromStorage();
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(['👍', '🔥']));
    const { topReactions } = useReactionFavorites();
    expect(topReactions.value.map((r) => r.emoji)).toEqual(['👍', '🔥']);
  });
});
