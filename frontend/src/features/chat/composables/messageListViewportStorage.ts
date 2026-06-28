/**
 * Session-only scroll anchor for a channel message list (UI state, not domain truth).
 *
 * Kept in memory for the lifetime of the current app session ONLY — it is never
 * persisted. Switching channels and coming back within the same session restores
 * where you were; a page reload / new tab / new session starts each channel at the
 * bottom of chat (the message list's default when there is no remembered anchor).
 */
export type MessageListViewportSnapshot = {
  anchorMessageId: string;
  /** Anchor top edge offset inside the scroll container viewport (px). */
  anchorTop: number;
  /** When true, new messages auto-follow the bottom while this channel is open. */
  followNewMessages: boolean;
  updatedAt: number;
};

type MessageListViewportStore = Record<string, MessageListViewportSnapshot>;

/**
 * Legacy localStorage key from when viewports were persisted across sessions.
 * We no longer read or write it; we proactively clear it so stale anchors from
 * before this change don't linger in users' browsers.
 */
export const MESSAGE_LIST_VIEWPORT_STORAGE_KEY =
  'echo-message-list-viewport-v1';

const MAX_STORED_VIEWPORTS = 150;

/** In-memory store — dies with the session, so positions never persist. */
let sessionStore: MessageListViewportStore = {};
let clearedLegacy = false;

function dropLegacyPersistedViewports(): void {
  if (clearedLegacy) return;
  clearedLegacy = true;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(MESSAGE_LIST_VIEWPORT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Cap memory growth across a long session that visits many channels. */
function pruneStore(): void {
  const ids = Object.keys(sessionStore);
  if (ids.length <= MAX_STORED_VIEWPORTS) return;
  const sorted = ids.sort(
    (a, b) =>
      (sessionStore[b]?.updatedAt ?? 0) - (sessionStore[a]?.updatedAt ?? 0),
  );
  const next: MessageListViewportStore = {};
  for (const id of sorted.slice(0, MAX_STORED_VIEWPORTS)) {
    const row = sessionStore[id];
    if (row) next[id] = row;
  }
  sessionStore = next;
}

export function readMessageListViewport(
  channelId: string,
): MessageListViewportSnapshot | null {
  dropLegacyPersistedViewports();
  const id = channelId.trim();
  if (!id) return null;
  return sessionStore[id] ?? null;
}

export function hasMessageListViewport(channelId: string): boolean {
  return readMessageListViewport(channelId) != null;
}

export function writeMessageListViewport(
  channelId: string,
  snapshot: Omit<MessageListViewportSnapshot, 'updatedAt'>,
): void {
  dropLegacyPersistedViewports();
  const id = channelId.trim();
  if (!id || !snapshot.anchorMessageId.trim()) return;
  sessionStore[id] = { ...snapshot, updatedAt: Date.now() };
  pruneStore();
}

export function clearMessageListViewport(channelId: string): void {
  const id = channelId.trim();
  if (!id) return;
  delete sessionStore[id];
}

/**
 * Retained for callers on channel leave / page hide. Session-only viewports have
 * nothing to flush — kept as a no-op so callers don't need to change.
 */
export function flushMessageListViewportStorage(): void {
  /* session-only: nothing is persisted, so nothing to flush */
}

/** Test helper: reset module state between specs. */
export function resetMessageListViewportStorageForTests(): void {
  sessionStore = {};
  clearedLegacy = false;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(MESSAGE_LIST_VIEWPORT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
