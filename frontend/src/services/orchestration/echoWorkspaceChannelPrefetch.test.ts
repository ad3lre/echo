import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EchoApiMessage } from '@/api/echo/messages';
import type { EchoWorkspaceState } from '@/api/echoClient';
import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import { _resetAllIndexesForTesting } from '@/features/chat/domain/channelMessageIndex';
import { bindChannelMessageBuckets } from '@/services/realtime/channelMessageAuthority';
import { messageWindowAuthority } from '@/services/realtime/messageWindowAuthority';
import { replaceChannelMessagesFromHistory } from '@/services/realtime/channelMessageAuthority';
import {
  applyPrefetchedWorkspaceChannelMessages,
  inboundUrlChannelId,
  prefetchChannelMessagesFirstPage,
  prefetchInboundUrlChannelFirstPage,
  resolveLikelyLandingTextChannelIds,
  resolveWorkspaceBootstrapTextChannelIds,
  shouldSkipChannelMessagePrefetch,
  _resetChannelMessagePrefetchForTesting,
} from '@/services/orchestration/echoWorkspaceChannelPrefetch';
import { ref } from 'vue';

vi.mock('@/api/echoClient', () => ({
  fetchEchoChannelMessages: vi.fn(),
}));

import { fetchEchoChannelMessages } from '@/api/echoClient';

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

function apiMsg(id: string, content: string): EchoApiMessage {
  return {
    id,
    channelId: 'ch-prefetch',
    authorId: 'u1',
    content,
    timestamp: '2026-05-24T12:13:00.000Z',
    messageFormatVersion: 1,
    contentSchemaVersion: 1,
  };
}

function rawMsg(id: string, content: string): RawMessage {
  return {
    id,
    authorId: 'u1',
    content,
    timestamp: '2026-05-24T12:13:00.000Z',
  };
}

function workspaceState(
  partial?: Partial<EchoWorkspaceState>,
): EchoWorkspaceState {
  return {
    servers: [{ id: 's1', name: 'One', ownerId: 'u1' }],
    categoriesByServer: {
      s1: [
        {
          id: 'cat1',
          name: 'General',
          channels: [
            {
              id: '00000000-0000-4000-8000-000000000010',
              name: 'general',
              type: 'text',
            },
            {
              id: '00000000-0000-4000-8000-000000000011',
              name: 'voice',
              type: 'voice',
            },
          ],
        },
      ],
    },
    serverMemberIds: { s1: ['u1'] },
    membersByServer: {},
    workspaceVersion: '1',
    ...partial,
  } as EchoWorkspaceState;
}

describe('applyPrefetchedWorkspaceChannelMessages', () => {
  const channelId = 'ch-prefetch';

  beforeEach(() => {
    _resetAllIndexesForTesting();
    messageWindowAuthority._resetForTesting();
    _resetChannelMessagePrefetchForTesting();
    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    messageWindowAuthority.setActiveChannel(channelId);
  });

  it('replaces when the channel bucket is empty', () => {
    applyPrefetchedWorkspaceChannelMessages(channelId, [
      apiMsg('m1', 'hello'),
      apiMsg('m2', 'world'),
    ]);
    const list = messageWindowAuthority.getIndex(channelId).sorted.value;
    expect(list.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('does not remove fresher local rows when prefetch response is stale', () => {
    replaceChannelMessagesFromHistory(channelId, [
      rawMsg('m1', 'hello'),
      rawMsg('m2', 'world'),
      rawMsg('m3', 'meow'),
    ]);
    applyPrefetchedWorkspaceChannelMessages(channelId, [
      apiMsg('m1', 'hello'),
      apiMsg('m2', 'world'),
    ]);
    const list = messageWindowAuthority.getIndex(channelId).sorted.value;
    expect(list.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('appends rows present only in the prefetch page', () => {
    replaceChannelMessagesFromHistory(channelId, [
      rawMsg('m1', 'hello'),
      rawMsg('m2', 'world'),
    ]);
    applyPrefetchedWorkspaceChannelMessages(channelId, [
      apiMsg('m1', 'hello'),
      apiMsg('m2', 'world'),
      apiMsg('m3', 'meow'),
    ]);
    const list = messageWindowAuthority.getIndex(channelId).sorted.value;
    expect(list.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('keeps hasMoreOlder true when a full (smaller) first page is applied', () => {
    // A first page that fills pageLimit means more history likely exists — scroll-up
    // pagination must stay enabled. Regression guard for the initial-page-size split.
    const full = Array.from({ length: 40 }, (_, i) =>
      apiMsg(`m${String(i).padStart(3, '0')}`, 'x'),
    );
    applyPrefetchedWorkspaceChannelMessages(channelId, full, 40);
    expect(messageWindowAuthority.hasMoreOlder.value).toBe(true);
  });

  it('sets hasMoreOlder false when the first page is shorter than pageLimit', () => {
    applyPrefetchedWorkspaceChannelMessages(channelId, [apiMsg('m1', 'x')], 40);
    expect(messageWindowAuthority.hasMoreOlder.value).toBe(false);
  });
});

describe('resolveWorkspaceBootstrapTextChannelIds', () => {
  it('prioritizes remembered landing channels ahead of per-server defaults', () => {
    const state = workspaceState({
      servers: [
        { id: 's1', name: 'One', imageUrl: '', ownerId: 'u1' },
        { id: 's2', name: 'Two', imageUrl: '', ownerId: 'u1' },
      ],
      categoriesByServer: {
        s1: [
          {
            id: 'cat1',
            name: 'General',
            channels: [
              {
                id: '00000000-0000-4000-8000-000000000020',
                name: 'general',
                type: 'text',
              },
            ],
          },
        ],
        s2: [
          {
            id: 'cat2',
            name: 'General',
            channels: [
              {
                id: '00000000-0000-4000-8000-000000000021',
                name: 'general',
                type: 'text',
              },
            ],
          },
        ],
      },
    });

    const ids = resolveWorkspaceBootstrapTextChannelIds(state, 2, {
      priorityChannelIds: ['00000000-0000-4000-8000-000000000021'],
    });
    expect(ids).toEqual([
      '00000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-000000000020',
    ]);
  });
});

describe('resolveLikelyLandingTextChannelIds', () => {
  beforeEach(() => {
    for (const k of Object.keys(lsStore)) delete lsStore[k];
    vi.stubGlobal('localStorage', memoryLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers last visited text channel on the last visited guild', () => {
    localStorage.setItem('echo-last-visited-guild-v1', 's1');
    localStorage.setItem(
      'echo-last-visited-server-channel-v1',
      JSON.stringify({ s1: '00000000-0000-4000-8000-000000000010' }),
    );
    const ids = resolveLikelyLandingTextChannelIds(workspaceState());
    expect(ids).toEqual(['00000000-0000-4000-8000-000000000010']);
  });
});

describe('prefetchChannelMessagesFirstPage', () => {
  const channelId = '00000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    _resetAllIndexesForTesting();
    messageWindowAuthority._resetForTesting();
    _resetChannelMessagePrefetchForTesting();
    vi.mocked(fetchEchoChannelMessages).mockReset();
    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
  });

  it('skips fetch when the bucket already has messages', async () => {
    replaceChannelMessagesFromHistory(channelId, [rawMsg('m1', 'hello')]);
    expect(shouldSkipChannelMessagePrefetch(channelId)).toBe(true);
    const ok = await prefetchChannelMessagesFirstPage('token', channelId);
    expect(ok).toBe(false);
    expect(fetchEchoChannelMessages).not.toHaveBeenCalled();
  });

  it('fetches and applies when the bucket is empty', async () => {
    vi.mocked(fetchEchoChannelMessages).mockResolvedValue({
      messages: [apiMsg('m1', 'hello')],
    });
    const ok = await prefetchChannelMessagesFirstPage('token', channelId);
    expect(ok).toBe(true);
    // First page uses the smaller INITIAL size so the skeleton clears sooner.
    expect(fetchEchoChannelMessages).toHaveBeenCalledWith('token', channelId, {
      limit: 40,
    });
    const list = messageWindowAuthority.getIndex(channelId).sorted.value;
    expect(list.map((m) => m.id)).toEqual(['m1']);
  });
});

describe('inbound URL channel prefetch (cold-boot waterfall collapse)', () => {
  const urlChannelId = '00000000-0000-4000-8000-000000000099';

  beforeEach(() => {
    _resetChannelMessagePrefetchForTesting();
    vi.mocked(fetchEchoChannelMessages).mockReset();
  });

  it('resolves the channel id from a guild channel URL', () => {
    expect(inboundUrlChannelId(`/channels/srv/${urlChannelId}`, '/')).toBe(
      urlChannelId,
    );
  });

  it('resolves the channel id from a DM thread URL', () => {
    expect(inboundUrlChannelId(`/channels/@me/c/${urlChannelId}`, '/')).toBe(
      urlChannelId,
    );
  });

  it('returns empty for non-channel routes and malformed ids', () => {
    expect(inboundUrlChannelId('/explore', '/')).toBe('');
    expect(inboundUrlChannelId('/channels/@me', '/')).toBe('');
    expect(inboundUrlChannelId('/channels/srv/not-a-real-id', '/')).toBe('');
  });

  it('prefetches the URL channel in parallel (only needs the token)', () => {
    vi.mocked(fetchEchoChannelMessages).mockResolvedValue({ messages: [] });
    prefetchInboundUrlChannelFirstPage(
      'token',
      `/channels/srv/${urlChannelId}`,
      '/',
    );
    expect(fetchEchoChannelMessages).toHaveBeenCalledWith(
      'token',
      urlChannelId,
      {
        limit: 40,
      },
    );
  });

  it('no-ops without a token or on a non-channel route', () => {
    prefetchInboundUrlChannelFirstPage(
      '',
      `/channels/srv/${urlChannelId}`,
      '/',
    );
    prefetchInboundUrlChannelFirstPage('token', '/explore', '/');
    expect(fetchEchoChannelMessages).not.toHaveBeenCalled();
  });
});
