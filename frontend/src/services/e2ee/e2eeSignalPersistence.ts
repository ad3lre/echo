/**
 * Key-value persistence for libsignal material: prefer IndexedDB, migrate from legacy localStorage.
 */

const DB_NAME = 'echo_e2ee_signal_v1';
const DB_VERSION = 1;
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;
let idbUnavailable = false;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function resetDbConnection(): void {
  dbPromise = null;
}

function isIdbClosingError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  if (err.name === 'InvalidStateError') return true;
  return err.message.includes('connection is closing');
}

function bindDbLifecycle(db: IDBDatabase): void {
  db.onversionchange = () => {
    db.close();
    resetDbConnection();
  };
  db.onclose = () => {
    resetDbConnection();
  };
}

function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) {
    return Promise.reject(new Error('indexedDB unavailable'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => {
        resetDbConnection();
        reject(req.error ?? new Error('idb open failed'));
      };
      req.onsuccess = () => {
        const db = req.result;
        bindDbLifecycle(db);
        resolve(db);
      };
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
    });
  }
  return dbPromise;
}

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  try {
    const db = await openDb();
    return await fn(db);
  } catch (err) {
    if (isIdbClosingError(err)) {
      resetDbConnection();
      const db = await openDb();
      return fn(db);
    }
    throw err;
  }
}

async function idbGet(key: string): Promise<string | undefined> {
  return withDb(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const r = tx.objectStore(STORE).get(key);
        r.onsuccess = () => {
          const v = r.result;
          resolve(typeof v === 'string' ? v : undefined);
        };
        r.onerror = () => reject(r.error ?? tx.error);
        tx.onerror = () => reject(tx.error ?? r.error);
      }),
  );
}

async function idbSet(key: string, value: string): Promise<void> {
  await withDb(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE).put(value, key);
      }),
  );
}

async function idbDelete(key: string): Promise<void> {
  await withDb(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE).delete(key);
      }),
  );
}

async function idbEntriesWithPrefix(
  prefix: string,
): Promise<[string, string][]> {
  return withDb(
    (db) =>
      new Promise((resolve, reject) => {
        const out: [string, string][] = [];
        const tx = db.transaction(STORE, 'readonly');
        const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
        const cur = tx.objectStore(STORE).openCursor(range);
        cur.onerror = () => reject(cur.error ?? tx.error);
        tx.onerror = () => reject(tx.error ?? cur.error);
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) {
            resolve(out);
            return;
          }
          if (typeof c.key === 'string' && typeof c.value === 'string') {
            out.push([c.key, c.value]);
          }
          c.continue();
        };
      }),
  );
}

function ls(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function lsKeysWithPrefix(prefix: string): string[] {
  const storage = ls();
  if (!storage) return [];
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i);
    if (k?.startsWith(prefix)) keys.push(k);
  }
  return keys;
}

/** Read from IDB first; if missing, migrate matching localStorage row into IDB. */
export async function echoSignalPersistenceGet(
  key: string,
): Promise<string | undefined> {
  const lstore = ls();
  if (!idbUnavailable) {
    try {
      const fromIdb = await idbGet(key);
      if (fromIdb !== undefined) return fromIdb;
    } catch {
      idbUnavailable = true;
    }
  }
  const fromLs = lstore?.getItem(key);
  if (fromLs == null) return undefined;
  if (!idbUnavailable) {
    try {
      await idbSet(key, fromLs);
      lstore?.removeItem(key);
    } catch {
      idbUnavailable = true;
    }
  }
  return fromLs;
}

export async function echoSignalPersistenceSet(
  key: string,
  value: string,
): Promise<void> {
  const lstore = ls();
  if (!idbUnavailable) {
    try {
      await idbSet(key, value);
      lstore?.removeItem(key);
      return;
    } catch {
      idbUnavailable = true;
    }
  }
  lstore?.setItem(key, value);
}

export async function echoSignalPersistenceRemove(key: string): Promise<void> {
  const lstore = ls();
  if (!idbUnavailable) {
    try {
      await idbDelete(key);
    } catch {
      idbUnavailable = true;
    }
  }
  lstore?.removeItem(key);
}

/** All `echo_sig_v1:{uid}:*` keys from IDB + any legacy localStorage not yet migrated. */
export async function echoSignalPersistenceExportPrefix(
  prefix: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!idbUnavailable) {
    try {
      const rows = await idbEntriesWithPrefix(prefix);
      for (const [k, v] of rows) out[k] = v;
    } catch {
      idbUnavailable = true;
    }
  }
  const storage = ls();
  if (!storage) return out;
  for (const k of lsKeysWithPrefix(prefix)) {
    if (out[k] !== undefined) continue;
    const v = storage.getItem(k);
    if (v != null) out[k] = v;
  }
  return out;
}

export async function echoSignalPersistenceImportEntries(
  entries: Record<string, string>,
): Promise<void> {
  for (const [key, val] of Object.entries(entries)) {
    await echoSignalPersistenceSet(key, val);
  }
}
