import { beforeEach, vi } from 'vitest';
import { ensurePdfEnvironmentPolyfills } from '@/features/pdf/ensurePdfEnvironment';
import { registerAuthSessionApiBridge } from '@/api/authSessionBridge';

ensurePdfEnvironmentPolyfills();

const createMemoryStorage = (): Storage => {
  const entries = new Map<string, string>();

  return {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, String(value));
    },
  };
};

const ensureStorage = (name: 'localStorage' | 'sessionStorage') => {
  if (typeof globalThis[name] !== 'undefined') {
    return;
  }

  vi.stubGlobal(name, createMemoryStorage());
};

/**
 * `authClient` calls into the session store via this bridge (avoids a store↔client import cycle).
 * Unit tests do not run `main.ts`, so register no-op handlers before each test file.
 */
beforeEach(() => {
  ensureStorage('localStorage');
  ensureStorage('sessionStorage');

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});

  registerAuthSessionApiBridge({
    invalidateSessionForReauth: () => {},
    clearLocalTokens: () => {},
  });
});
