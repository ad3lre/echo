import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getChannelMoveCrossCategoryPermission,
  setChannelMoveCrossCategoryPermission,
} from './useChannelMoveCrossCategoryPreference';

const STORAGE_KEY = 'echo.channelMoveCrossCategoryPermission';

const lsStore: Record<string, string> = {};

function memoryLocalStorage(): Storage {
  return {
    get length() {
      return Object.keys(lsStore).length;
    },
    clear: () => {
      for (const k of Object.keys(lsStore)) delete lsStore[k];
    },
    getItem: (k: string) => (k in lsStore ? lsStore[k] : null),
    key: (i: number) => Object.keys(lsStore)[i] ?? null,
    removeItem: (k: string) => {
      delete lsStore[k];
    },
    setItem: (k: string, v: string) => {
      lsStore[k] = v;
    },
  } as Storage;
}

describe('useChannelMoveCrossCategoryPreference', () => {
  beforeEach(() => {
    for (const k of Object.keys(lsStore)) delete lsStore[k];
    const storage = memoryLocalStorage();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', { ...globalThis, localStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to ask when nothing is stored', () => {
    expect(getChannelMoveCrossCategoryPermission()).toBe('ask');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('reads and writes explicit keep/sync/ask preferences', () => {
    setChannelMoveCrossCategoryPermission('keep');
    expect(getChannelMoveCrossCategoryPermission()).toBe('keep');
    setChannelMoveCrossCategoryPermission('sync');
    expect(getChannelMoveCrossCategoryPermission()).toBe('sync');
    setChannelMoveCrossCategoryPermission('ask');
    expect(getChannelMoveCrossCategoryPermission()).toBe('ask');
  });
});
