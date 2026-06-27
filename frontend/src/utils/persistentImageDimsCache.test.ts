import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Backing localStorage + window stub so these tests run in the default `node`
 * vitest env. Returns the captured event listeners so we can fire `pagehide`
 * to force a synchronous flush instead of waiting on the debounce timer.
 */
function installWindow(store = new Map<string, string>()) {
  const listeners = new Map<string, () => void>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal('window', {
    localStorage,
    addEventListener: (type: string, cb: () => void) =>
      void listeners.set(type, cb),
  });
  vi.stubGlobal('document', { visibilityState: 'visible' });
  return { store, listeners };
}

async function loadModule() {
  vi.resetModules();
  return import('./persistentImageDimsCache');
}

describe('persistentImageDimsCache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips dimensions across a simulated reload', async () => {
    const { store, listeners } = installWindow();
    const url = 'https://cdn.example/api/v1/echo/uploads/files/echo/chat/a.png';

    let mod = await loadModule();
    expect(mod.getPersistentImageDimensions(url)).toBeNull();
    mod.rememberPersistentImageDimensions(url, { width: 800, height: 450 });
    expect(mod.getPersistentImageDimensions(url)).toEqual({
      width: 800,
      height: 450,
    });

    // Flush to storage as if the tab were backgrounded.
    listeners.get('pagehide')?.();
    expect(store.size).toBeGreaterThan(0);

    // Reload: same backing store, fresh module instance.
    installWindow(store);
    mod = await loadModule();
    expect(mod.getPersistentImageDimensions(url)).toEqual({
      width: 800,
      height: 450,
    });
  });

  it('shares one entry for the same Echo storage key across hosts', async () => {
    installWindow();
    const mod = await loadModule();
    const original =
      'https://host-a.example/api/v1/echo/uploads/files/echo/chat/x.png';
    const sameKeyDifferentHost =
      'https://cdn-b.example/api/v1/echo/uploads/files/echo/chat/x.png';

    mod.rememberPersistentImageDimensions(original, {
      width: 1280,
      height: 720,
    });
    // A different read-through host for the same storage key must hit.
    expect(mod.getPersistentImageDimensions(sameKeyDifferentHost)).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it('keys external (non-Echo) URLs by the full URL', async () => {
    installWindow();
    const mod = await loadModule();
    mod.rememberPersistentImageDimensions('https://media.tenor.com/abc.gif', {
      width: 480,
      height: 270,
    });
    expect(
      mod.getPersistentImageDimensions('https://media.tenor.com/abc.gif'),
    ).toEqual({ width: 480, height: 270 });
    expect(
      mod.getPersistentImageDimensions('https://media.tenor.com/other.gif'),
    ).toBeNull();
  });

  it('ignores blob/data URLs and zero dimensions', async () => {
    installWindow();
    const mod = await loadModule();
    mod.rememberPersistentImageDimensions('blob:nope', {
      width: 10,
      height: 10,
    });
    mod.rememberPersistentImageDimensions('https://e/x.png', {
      width: 0,
      height: 0,
    });
    expect(mod.getPersistentImageDimensions('blob:nope')).toBeNull();
    expect(mod.getPersistentImageDimensions('https://e/x.png')).toBeNull();
  });
});
