import { tryLocalStorageSetItem } from '@/utils/localStoragePersist';

/** Persisted scroll anchor for one channel message list (UI state, not domain truth). */
export type MessageListViewportSnapshot = {
  anchorMessageId: string;
  /** Anchor top edge offset inside the scroll container viewport (px). */
  anchorTop: number;
  /** When true, new messages auto-follow the bottom while this channel is open. */
  followNewMessages: boolean;
  updatedAt: number;
};

type MessageListViewportStore = Record<string, MessageListViewportSnapshot>;

export const MESSAGE_LIST_VIEWPORT_STORAGE_KEY =
  'echo-message-list-viewport-v1';

const MAX_STORED_VIEWPORTS = 150;

let memoryCache: MessageListViewportStore | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function parseStore(raw: string | null): MessageListViewportStore {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const out: MessageListViewportStore = {};
    for (const [channelId, entry] of Object.entries(parsed)) {
      if (!channelId.trim() || !isRecord(entry)) continue;
      const anchorMessageId = entry.anchorMessageId;
      const anchorTop = entry.anchorTop;
      if (typeof anchorMessageId !== 'string' || !anchorMessageId.trim()) {
        continue;
      }
      if (typeof anchorTop !== 'number' || !Number.isFinite(anchorTop)) {
        continue;
      }
      const followNewMessages =
        typeof entry.followNewMessages === 'boolean'
          ? entry.followNewMessages
          : true;
      const updatedAt =
        typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
          ? entry.updatedAt
          : 0;
      out[channelId] = {
        anchorMessageId: anchorMessageId.trim(),
        anchorTop,
        followNewMessages,
        updatedAt,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function readStore(): MessageListViewportStore {
  if (memoryCache) return memoryCache;
  if (typeof localStorage === 'undefined') {
    memoryCache = {};
    return memoryCache;
  }
  try {
    memoryCache = parseStore(
      localStorage.getItem(MESSAGE_LIST_VIEWPORT_STORAGE_KEY),
    );
  } catch {
    memoryCache = {};
  }
  return memoryCache;
}

function pruneStore(store: MessageListViewportStore): MessageListViewportStore {
  const ids = Object.keys(store);
  if (ids.length <= MAX_STORED_VIEWPORTS) return store;
  const sorted = ids.sort(
    (a, b) => (store[b]?.updatedAt ?? 0) - (store[a]?.updatedAt ?? 0),
  );
  const keep = new Set(sorted.slice(0, MAX_STORED_VIEWPORTS));
  const next: MessageListViewportStore = {};
  for (const id of keep) {
    const row = store[id];
    if (row) next[id] = row;
  }
  return next;
}

function flushStoreToLocalStorage(store: MessageListViewportStore): void {
  tryLocalStorageSetItem(
    MESSAGE_LIST_VIEWPORT_STORAGE_KEY,
    JSON.stringify(store),
  );
}

function schedulePersistToLocalStorage(): void {
  if (persistTimer != null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!memoryCache) return;
    flushStoreToLocalStorage(pruneStore(memoryCache));
  }, 300);
}

export function readMessageListViewport(
  channelId: string,
): MessageListViewportSnapshot | null {
  const id = channelId.trim();
  if (!id) return null;
  return readStore()[id] ?? null;
}

export function hasMessageListViewport(channelId: string): boolean {
  return readMessageListViewport(channelId) != null;
}

export function writeMessageListViewport(
  channelId: string,
  snapshot: Omit<MessageListViewportSnapshot, 'updatedAt'>,
): void {
  const id = channelId.trim();
  if (!id || !snapshot.anchorMessageId.trim()) return;
  const store = { ...readStore() };
  store[id] = { ...snapshot, updatedAt: Date.now() };
  memoryCache = store;
  schedulePersistToLocalStorage();
}

export function clearMessageListViewport(channelId: string): void {
  const id = channelId.trim();
  if (!id) return;
  const store = readStore();
  if (!store[id]) return;
  const next = { ...store };
  delete next[id];
  memoryCache = next;
  schedulePersistToLocalStorage();
}

/** Immediate localStorage flush — call on channel leave / page hide. */
export function flushMessageListViewportStorage(): void {
  if (persistTimer != null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!memoryCache) return;
  flushStoreToLocalStorage(pruneStore(memoryCache));
}

/** Test helper: reset module cache between specs. */
export function resetMessageListViewportStorageForTests(): void {
  if (persistTimer != null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  memoryCache = null;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(MESSAGE_LIST_VIEWPORT_STORAGE_KEY);
  }
}
