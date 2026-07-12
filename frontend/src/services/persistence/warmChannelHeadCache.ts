import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import {
  WARM_CHANNEL_CACHE_EXPIRY_MS,
  WARM_CHANNEL_CACHE_MAX_CHANNELS,
  WARM_CHANNEL_CACHE_MESSAGES_PER_CHANNEL,
} from '@/constants/warmChannelCache';

const DB_NAME = 'echo-warm-channel-heads';
const DB_VERSION = 1;
const STORE_NAME = 'channel-heads';

export type WarmChannelHead = {
  key: string;
  userId: string;
  serverId: string;
  channelId: string;
  messages: RawMessage[];
  hasMoreOlder: boolean;
  lastAccessedAt: number;
  lastRefreshedAt: number;
};

export type WriteWarmChannelHeadInput = Omit<
  WarmChannelHead,
  'key' | 'messages' | 'lastAccessedAt' | 'lastRefreshedAt'
> & {
  messages: readonly RawMessage[];
  lastAccessedAt?: number;
  lastRefreshedAt?: number;
};

function entryKey(userId: string, serverId: string, channelId: string): string {
  return `${userId.trim()}\u001f${serverId.trim()}\u001f${channelId.trim()}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

async function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(STORE_NAME)) return;
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      store.createIndex('user-server', ['userId', 'serverId'], {
        unique: false,
      });
      store.createIndex('user', 'userId', { unique: false });
    };
    const db = await requestResult(request);
    db.onversionchange = () => db.close();
    return db;
  } catch {
    return null;
  }
}

async function readServerEntries(
  db: IDBDatabase,
  userId: string,
  serverId: string,
): Promise<unknown[]> {
  const tx = db.transaction(STORE_NAME, 'readonly');
  const index = tx.objectStore(STORE_NAME).index('user-server');
  const rows = await requestResult(
    index.getAll(IDBKeyRange.only([userId.trim(), serverId.trim()])),
  );
  return rows;
}

function isWarmChannelHead(row: unknown): row is WarmChannelHead {
  if (!row || typeof row !== 'object') return false;
  const candidate = row as Partial<WarmChannelHead>;
  return (
    typeof candidate.key === 'string' &&
    typeof candidate.userId === 'string' &&
    typeof candidate.serverId === 'string' &&
    typeof candidate.channelId === 'string' &&
    Array.isArray(candidate.messages) &&
    typeof candidate.hasMoreOlder === 'boolean' &&
    typeof candidate.lastAccessedAt === 'number' &&
    Number.isFinite(candidate.lastAccessedAt) &&
    typeof candidate.lastRefreshedAt === 'number' &&
    Number.isFinite(candidate.lastRefreshedAt)
  );
}

export async function readWarmChannelHeadsForServer(
  userId: string,
  serverId: string,
  opts?: { now?: number; priorityChannelIds?: readonly string[] },
): Promise<WarmChannelHead[]> {
  const uid = userId.trim();
  const sid = serverId.trim();
  if (!uid || !sid) return [];
  const db = await openDb();
  if (!db) return [];
  try {
    const now = opts?.now ?? Date.now();
    const storedRows = await readServerEntries(db, uid, sid);
    const rows = storedRows.filter(isWarmChannelHead);
    const corruptKeys = storedRows
      .filter((row) => !isWarmChannelHead(row))
      .map((row) => {
        if (!row || typeof row !== 'object') return '';
        const key = (row as { key?: unknown }).key;
        return typeof key === 'string' ? key : '';
      })
      .filter(Boolean);
    const expired = rows.filter(
      (row) => now - row.lastRefreshedAt > WARM_CHANNEL_CACHE_EXPIRY_MS,
    );
    if (expired.length || corruptKeys.length) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const row of expired) store.delete(row.key);
      for (const key of corruptKeys) store.delete(key);
      await transactionDone(tx);
    }
    const priority = new Map(
      (opts?.priorityChannelIds ?? []).map((id, index) => [id.trim(), index]),
    );
    return rows
      .filter(
        (row) => now - row.lastRefreshedAt <= WARM_CHANNEL_CACHE_EXPIRY_MS,
      )
      .sort((a, b) => {
        const ap = priority.get(a.channelId) ?? Number.MAX_SAFE_INTEGER;
        const bp = priority.get(b.channelId) ?? Number.MAX_SAFE_INTEGER;
        return ap - bp || b.lastAccessedAt - a.lastAccessedAt;
      })
      .slice(0, WARM_CHANNEL_CACHE_MAX_CHANNELS);
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export async function writeWarmChannelHead(
  input: WriteWarmChannelHeadInput,
): Promise<void> {
  const userId = input.userId.trim();
  const serverId = input.serverId.trim();
  const channelId = input.channelId.trim();
  if (!userId || !serverId || !channelId || input.messages.length === 0) return;
  const db = await openDb();
  if (!db) return;
  try {
    const now = Date.now();
    const readTx = db.transaction(STORE_NAME, 'readonly');
    const existing = (await requestResult(
      readTx.objectStore(STORE_NAME).get(entryKey(userId, serverId, channelId)),
    )) as WarmChannelHead | undefined;
    const row: WarmChannelHead = {
      key: entryKey(userId, serverId, channelId),
      userId,
      serverId,
      channelId,
      messages: input.messages.slice(-WARM_CHANNEL_CACHE_MESSAGES_PER_CHANNEL),
      hasMoreOlder: input.hasMoreOlder,
      // A background refresh is not user access; preserve LRU age unless touched.
      lastAccessedAt: input.lastAccessedAt ?? existing?.lastAccessedAt ?? now,
      lastRefreshedAt: input.lastRefreshedAt ?? now,
    };
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(row);
    await transactionDone(tx);
    await pruneWarmChannelHeads(userId, serverId, db);
  } catch {
    // Cache persistence is best-effort; network history remains authoritative.
  } finally {
    db.close();
  }
}

async function pruneWarmChannelHeads(
  userId: string,
  serverId: string,
  existingDb?: IDBDatabase,
): Promise<void> {
  const db = existingDb ?? (await openDb());
  if (!db) return;
  try {
    const rows = (await readServerEntries(db, userId, serverId)).filter(
      isWarmChannelHead,
    );
    const overflow = rows
      .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
      .slice(WARM_CHANNEL_CACHE_MAX_CHANNELS);
    if (!overflow.length) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const row of overflow) store.delete(row.key);
    await transactionDone(tx);
  } finally {
    if (!existingDb) db.close();
  }
}

export async function touchWarmChannelHead(
  userId: string,
  serverId: string,
  channelId: string,
  now = Date.now(),
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const key = entryKey(userId, serverId, channelId);
    const row = (await requestResult(store.get(key))) as
      | WarmChannelHead
      | undefined;
    if (row) store.put({ ...row, lastAccessedAt: now });
    await transactionDone(tx);
  } catch {
    // Best-effort LRU touch.
  } finally {
    db.close();
  }
}

export async function clearWarmChannelHeadsForUser(
  userId: string,
): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  const db = await openDb();
  if (!db) return;
  try {
    const readTx = db.transaction(STORE_NAME, 'readonly');
    const index = readTx.objectStore(STORE_NAME).index('user');
    const keys = await requestResult(index.getAllKeys(IDBKeyRange.only(uid)));
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const key of keys) store.delete(key);
    await transactionDone(tx);
  } catch {
    // Best-effort logout cleanup.
  } finally {
    db.close();
  }
}
