import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { bindChannelMessageBuckets } from '@/features/chat/domain/channelMessageAuthority';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import {
  clearMessageSessionCache,
  readMessageSessionCacheForChannel,
  trySeedChannelFromMessageSessionCache,
  writeMessageSessionCacheForChannel,
} from './messageSessionCache';

const USER = 'user-1';
const CHANNEL = '1492135186257805999';

function mockSessionStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  } as Storage;
}

function rawMsg(id: string, content: string) {
  return {
    id,
    authorId: 'author-1',
    timestamp: '2026-01-01T00:00:00.000Z',
    content,
  };
}

describe('messageSessionCache', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', mockSessionStorage());
    clearMessageSessionCache();
    messageWindowAuthority._resetForTesting();
    bindChannelMessageBuckets(ref<Record<string, RawMessage[]>>({}));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearMessageSessionCache();
    messageWindowAuthority._resetForTesting();
  });

  it('writes and reads channel snapshots for the same user', () => {
    writeMessageSessionCacheForChannel(
      USER,
      CHANNEL,
      [rawMsg('m1', 'hello')],
      true,
    );
    const cached = readMessageSessionCacheForChannel(USER, CHANNEL);
    expect(cached?.messages).toHaveLength(1);
    expect(cached?.messages[0]?.content).toBe('hello');
    expect(cached?.hasMoreOlder).toBe(true);
  });

  it('seeds an empty channel bucket from session cache', () => {
    writeMessageSessionCacheForChannel(
      USER,
      CHANNEL,
      [rawMsg('m1', 'cached')],
      false,
    );
    const seeded = trySeedChannelFromMessageSessionCache(
      USER,
      CHANNEL,
      CHANNEL,
    );
    expect(seeded).toBe(true);
    expect(messageWindowAuthority.getIndex(CHANNEL).sorted.value).toHaveLength(
      1,
    );
  });
});
