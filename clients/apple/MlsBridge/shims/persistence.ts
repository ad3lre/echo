/** KV persistence bridged to Swift Keychain via the WKWebView host. */

type Host = {
  storageGet: (key: string) => string | null;
  storageSet: (key: string, value: string) => void;
  storageRemove: (key: string) => void;
  /** Optional: list keys that start with prefix (falls back to localStorage). */
  storageKeysWithPrefix?: (prefix: string) => string[];
};

function host(): Host {
  const h = (globalThis as { __echoMlsHost?: Host }).__echoMlsHost;
  if (!h) throw new Error('Echo MLS host storage is not installed.');
  return h;
}

function keysWithPrefix(prefix: string): string[] {
  const h = host();
  if (typeof h.storageKeysWithPrefix === 'function') {
    return h.storageKeysWithPrefix(prefix);
  }
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  if (!storage) return [];
  const out: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i);
    if (k?.startsWith(prefix)) out.push(k);
  }
  return out;
}

export async function echoSignalPersistenceGet(
  key: string,
): Promise<string | undefined> {
  const value = host().storageGet(key);
  return value == null ? undefined : value;
}

export async function echoSignalPersistenceSet(
  key: string,
  value: string,
): Promise<void> {
  host().storageSet(key, value);
}

export async function echoSignalPersistenceRemove(key: string): Promise<void> {
  host().storageRemove(key);
}

export async function echoSignalPersistenceExportPrefix(
  prefix: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const key of keysWithPrefix(prefix)) {
    const value = host().storageGet(key);
    if (value != null) out[key] = value;
  }
  return out;
}

export async function echoSignalPersistenceImportEntries(
  entries: Record<string, string>,
): Promise<void> {
  for (const [key, value] of Object.entries(entries)) {
    host().storageSet(key, value);
  }
}
