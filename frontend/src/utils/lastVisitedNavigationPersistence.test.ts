import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readLastVisitedGuildId,
  readLastVisitedServerChannelMap,
  writeLastVisitedGuildId,
  writeLastVisitedServerChannelMap,
} from '@/utils/lastVisitedNavigationPersistence';

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

describe('lastVisitedNavigationPersistence', () => {
  beforeEach(() => {
    for (const k of Object.keys(lsStore)) delete lsStore[k];
    const storage = memoryLocalStorage();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips guild and channel maps', () => {
    writeLastVisitedGuildId('server-a');
    writeLastVisitedServerChannelMap({ 'server-a': 'channel-a' });
    expect(readLastVisitedGuildId()).toBe('server-a');
    expect(readLastVisitedServerChannelMap()).toEqual({
      'server-a': 'channel-a',
    });
  });
});
