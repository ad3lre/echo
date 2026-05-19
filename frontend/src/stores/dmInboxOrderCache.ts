import { defineStore } from 'pinia';

const STORAGE_KEY = 'echo-dm-inbox-order-v2';

type PersistedEntry = { id: string; rankMs: number };

function loadFromStorage(): Map<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Map();
    const result = new Map<string, number>();
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as PersistedEntry).id === 'string' &&
        typeof (item as PersistedEntry).rankMs === 'number'
      ) {
        result.set(
          (item as PersistedEntry).id,
          (item as PersistedEntry).rankMs,
        );
      }
    }
    return result;
  } catch {
    return new Map();
  }
}

/**
 * Persists the last rendered DM inbox order to localStorage so the next session can
 * render the list in true chronological order before any live activity arrives.
 *
 * IMPORTANT: stores the **real** ms-epoch sort key per entry (from the activity-rank
 * the inbox sort just used), not a synthetic `now - i*1000` cascade. Recording real
 * timestamps means: (1) the cold-start view matches the last live view byte for byte,
 * (2) when partial live data arrives, comparing one entry's persisted rank against
 * another's live rank is meaningful instead of arbitrary, and (3) a stale never-bumped
 * entry doesn't float to the top just because it was rendered most recently.
 *
 * Keys are peer user IDs for 1:1 DMs and channel IDs for group DMs — matching
 * `DmPanelInboxEntry.id` in both cases.
 *
 * `initialRankMsByKey` is intentionally a plain (non-reactive) Map so the inbox
 * computed can read it without tracking it as a dependency — this prevents a feedback
 * loop where every `saveOrder` call would re-trigger the computed infinitely.
 */
export const useDmInboxOrderCacheStore = defineStore(
  'dmInboxOrderCache',
  () => {
    /**
     * Snapshot from localStorage, read once at startup. Non-reactive by design.
     * Passed into the inbox sort as a cold-start fallback only.
     */
    const initialRankMsByKey: ReadonlyMap<string, number> = loadFromStorage();

    /**
     * Persist real per-entry sort keys. Callers MUST pass the same ms-epoch number that
     * was used to produce the visible order this frame; otherwise the cold-start view
     * will diverge from the last live view.
     */
    function saveOrder(
      entries: readonly { id: string; rankMs: number }[],
    ): void {
      if (!entries.length) return;
      const serialised: PersistedEntry[] = entries
        .filter((e) => e && typeof e.id === 'string' && e.id && e.rankMs > 0)
        .map((e) => ({ id: e.id, rankMs: Math.floor(e.rankMs) }));
      if (!serialised.length) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serialised));
      } catch {
        /* quota / private mode */
      }
    }

    return { initialRankMsByKey, saveOrder };
  },
);
