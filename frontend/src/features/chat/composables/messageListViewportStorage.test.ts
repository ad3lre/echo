import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MESSAGE_LIST_VIEWPORT_STORAGE_KEY,
  clearMessageListViewport,
  flushMessageListViewportStorage,
  hasMessageListViewport,
  readMessageListViewport,
  resetMessageListViewportStorageForTests,
  writeMessageListViewport,
} from './messageListViewportStorage';

function memoryLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
}

describe('messageListViewportStorage (session-only)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', memoryLocalStorage());
    resetMessageListViewportStorageForTests();
  });

  it('round-trips viewport snapshot per channel in memory', () => {
    writeMessageListViewport('ch-a', {
      anchorMessageId: 'm1',
      anchorTop: 42,
      followNewMessages: false,
    });
    expect(hasMessageListViewport('ch-a')).toBe(true);
    expect(readMessageListViewport('ch-a')).toMatchObject({
      anchorMessageId: 'm1',
      anchorTop: 42,
      followNewMessages: false,
    });
    expect(readMessageListViewport('ch-b')).toBeNull();
  });

  it('never persists to localStorage (session-only)', () => {
    writeMessageListViewport('ch-a', {
      anchorMessageId: 'm1',
      anchorTop: 10,
      followNewMessages: true,
    });
    vi.advanceTimersByTime(1000);
    expect(localStorage.getItem(MESSAGE_LIST_VIEWPORT_STORAGE_KEY)).toBeNull();
  });

  it('flush is a no-op and writes nothing to localStorage', () => {
    writeMessageListViewport('ch-a', {
      anchorMessageId: 'm1',
      anchorTop: 10,
      followNewMessages: true,
    });
    flushMessageListViewportStorage();
    expect(localStorage.getItem(MESSAGE_LIST_VIEWPORT_STORAGE_KEY)).toBeNull();
    // still readable in memory within the session
    expect(readMessageListViewport('ch-a')?.anchorMessageId).toBe('m1');
  });

  it('clears legacy persisted anchors on first access', () => {
    localStorage.setItem(MESSAGE_LIST_VIEWPORT_STORAGE_KEY, '{"ch-x":{}}');
    readMessageListViewport('ch-a');
    expect(localStorage.getItem(MESSAGE_LIST_VIEWPORT_STORAGE_KEY)).toBeNull();
  });

  it('clearMessageListViewport removes one channel', () => {
    writeMessageListViewport('ch-a', {
      anchorMessageId: 'm1',
      anchorTop: 10,
      followNewMessages: true,
    });
    writeMessageListViewport('ch-b', {
      anchorMessageId: 'm2',
      anchorTop: 20,
      followNewMessages: false,
    });
    clearMessageListViewport('ch-a');
    expect(readMessageListViewport('ch-a')).toBeNull();
    expect(readMessageListViewport('ch-b')?.anchorMessageId).toBe('m2');
  });
});
