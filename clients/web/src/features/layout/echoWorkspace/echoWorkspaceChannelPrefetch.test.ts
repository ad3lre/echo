import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EchoApiMessage } from '@/api/echo/messages';
import type { EchoWorkspaceState } from '@/api/echoClient';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { _resetAllIndexesForTesting } from '@/features/chat/domain/channelMessageIndex';
import { bindChannelMessageBuckets } from '@/features/chat/domain/channelMessageAuthority';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import { replaceChannelMessagesFromHistory } from '@/features/chat/domain/channelMessageAuthority';
import {
  applyPrefetchedWorkspaceChannelMessages,
  cancelChannelMessagePrefetch,
  canWarmChannelHeadsInBackground,
  inboundUrlChannelId,
  prefetchChannelMessagesFirstPage,
  prefetchInboundUrlChannelFirstPage,
  resolveLikelyLandingTextChannelIds,
  resolveWorkspaceBootstrapTextChannelIds,
  resolveWarmServerTextChannelIds,
  runWarmChannelTasksWithConcurrency,
  shouldSkipChannelMessagePrefetch,
  warmCurrentServerChannelHeadsNonBlocking,
  _resetChannelMessagePrefetchForTesting,
} from '@/features/layout/echoWorkspace/echoWorkspaceChannelPrefetch';
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

describe('warm server channel selection', () => {
  it('prioritizes active, attention, and recent channels and caps the pool at 30', () => {
    const channels = Array.from({ length: 35 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      name: `channel-${i}`,
      type: 'text' as const,
    }));
    const state = workspaceState({
      categoriesByServer: {
        s1: [{ id: 'cat', name: 'All', channels }],
      },
    });
    const ids = resolveWarmServerTextChannelIds(state, 's1', {
      activeChannelId: channels[20]!.id,
      attentionChannelIds: [channels[19]!.id],
      recentChannelIds: [channels[18]!.id],
    });
    expect(ids).toHaveLength(30);
    expect(ids.slice(0, 3)).toEqual([
      channels[20]!.id,
      channels[19]!.id,
      channels[18]!.id,
    ]);
  });

  it('runs no more than three background tasks concurrently', async () => {
    let active = 0;
    let peak = 0;
    await runWarmChannelTasksWithConcurrency(
      ['a', 'b', 'c', 'd', 'e', 'f'],
      3,
      async () => {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
      },
    );
    expect(peak).toBe(3);
  });
});

describe('background warm-up network gates', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pauses for data saver, slow connections, offline, and hidden tabs', () => {
    vi.stubGlobal('navigator', {
      onLine: true,
      connection: { effectiveType: '4g', saveData: true },
    });
    vi.stubGlobal('document', { visibilityState: 'visible' });
    expect(canWarmChannelHeadsInBackground()).toBe(false);

    vi.stubGlobal('navigator', {
      onLine: true,
      connection: { effectiveType: '2g', saveData: false },
    });
    expect(canWarmChannelHeadsInBackground()).toBe(false);

    vi.stubGlobal('navigator', {
      onLine: false,
      connection: { effectiveType: '4g', saveData: false },
    });
    expect(canWarmChannelHeadsInBackground()).toBe(false);

    vi.stubGlobal('navigator', {
      onLine: true,
      connection: { effectiveType: '4g', saveData: false },
    });
    vi.stubGlobal('document', { visibilityState: 'hidden' });
    expect(canWarmChannelHeadsInBackground()).toBe(false);
  });
});

describe('current-server warming ownership', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hydrates but does not network-prefetch the active channel', async () => {
    const serverId = '00000000-0000-4000-8000-000000000100';
    const activeId = '00000000-0000-4000-8000-000000000101';
    const backgroundId = '00000000-0000-4000-8000-000000000102';
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('navigator', {
      onLine: true,
      connection: { effectiveType: '4g', saveData: false },
    });
    vi.stubGlobal('document', { visibilityState: 'visible' });
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      callback();
      return 1;
    });
    vi.mocked(fetchEchoChannelMessages).mockResolvedValue({ messages: [] });

    warmCurrentServerChannelHeadsNonBlocking(
      'token',
      {
        categoriesByServer: {
          [serverId]: [
            {
              id: 'cat',
              name: 'General',
              channels: [
                { id: activeId, name: 'active', type: 'text' },
                { id: backgroundId, name: 'background', type: 'text' },
              ],
            },
          ],
        },
      },
      serverId,
      { userId: 'u1', activeChannelId: activeId },
    );

    await vi.waitFor(() => {
      expect(fetchEchoChannelMessages).toHaveBeenCalledTimes(1);
    });
    expect(fetchEchoChannelMessages).toHaveBeenCalledWith(
      'token',
      backgroundId,
      expect.objectContaining({ limit: 30 }),
    );
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
    expect(fetchEchoChannelMessages).toHaveBeenCalledWith(
      'token',
      channelId,
      expect.objectContaining({ limit: 40 }),
    );
    const list = messageWindowAuthority.getIndex(channelId).sorted.value;
    expect(list.map((m) => m.id)).toEqual(['m1']);
  });

  it('cancels channel-specific background ownership before active history takes over', async () => {
    vi.mocked(fetchEchoChannelMessages).mockImplementation(
      async (_token, _channelId, opts) =>
        new Promise((resolve, reject) => {
          opts?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    const pending = prefetchChannelMessagesFirstPage('token', channelId);
    cancelChannelMessagePrefetch(channelId);
    await expect(pending).resolves.toBe(false);
    expect(shouldSkipChannelMessagePrefetch(channelId)).toBe(false);
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
      expect.objectContaining({ limit: 40 }),
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
