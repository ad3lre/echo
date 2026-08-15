import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, ref, shallowRef } from 'vue';
import type * as EchoClientApi from '@/api/echoClient';
import { useEchoHistory } from './useEchoHistory';
import { bindChannelMessageBuckets } from '@/services/realtime/channelMessageAuthority';
import { replaceChannelMessagesFromHistory } from '@/services/realtime/channelMessageAuthority';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import { _resetAllIndexesForTesting } from '@/features/chat/domain/channelMessageIndex';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { registerEchoPendingClientMessageList } from '@/services/realtime/echoPendingClientMessageRegistry';
import { recordPendingClientMessage } from '@/services/realtime/socketPendingClientMessages';
import {
  fetchEchoAttentionSummary,
  fetchEchoChannelMessages,
  putEchoChannelReadState,
} from '@/api/echoClient';
import { ECHO_HISTORY_INITIAL_FETCH_TIMEOUT_MS } from '@/features/chat/constants/echoHistoryFetchTimeouts';
import { EchoApiError } from '@/api/echo/transport';
import {
  resetMessageListViewportStorageForTests,
  writeMessageListViewport,
} from '@/features/chat/composables/messageListViewportStorage';

const { authState } = vi.hoisted(() => ({
  authState: {
    isAuthenticated: true,
    accessToken: 'token',
  },
}));

vi.mock('@/stores/authSession', () => ({
  useAuthSessionStore: () => authState,
}));

vi.mock('@/api/echoClient', async (importOriginal) => {
  const actual = await importOriginal<typeof EchoClientApi>();
  return {
    ...actual,
    fetchEchoChannelMessages: vi.fn(),
    fetchEchoAttentionSummary: vi.fn(),
    putEchoChannelReadState: vi.fn(),
  };
});

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function apiMessage(id: string, channelId: string) {
  return {
    id,
    channelId,
    authorId: '1492135186257805310',
    content: id,
    timestamp: '2026-04-10T12:00:00.000Z',
    messageFormatVersion: 1,
    contentSchemaVersion: 1,
  };
}

describe('useEchoHistory', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    _resetAllIndexesForTesting();
    messageWindowAuthority._resetForTesting();
    vi.useFakeTimers();
    vi.mocked(fetchEchoChannelMessages).mockReset();
    vi.mocked(fetchEchoAttentionSummary).mockReset();
    vi.mocked(putEchoChannelReadState).mockReset();
    registerEchoPendingClientMessageList([]);
    authState.isAuthenticated = true;
    authState.accessToken = 'token';
    resetMessageListViewportStorageForTests();
  });

  it('does not clear unread from attention until the active thread is actually read-eligible', async () => {
    const channelId = '1492135186257805312';
    const lastUnreadMessageId = '1492135186257805315';
    vi.mocked(fetchEchoChannelMessages).mockResolvedValue({ messages: [] });
    vi.mocked(fetchEchoAttentionSummary).mockResolvedValue({
      channelAttentionByChannelId: {
        [channelId]: {
          channelId,
          kind: 'dm',
          lastReadMessageId: null,
          unreadCount: 3,
          firstUnreadMessageId: lastUnreadMessageId,
          latestUnreadMessageId: lastUnreadMessageId,
          latestUnreadMessageAt: '2026-04-10T12:00:00.000Z',
          peerUserId: '1492135186257805310',
        },
      },
      serverAttentionByServerId: {},
      serverNotificationLevelByServerId: {},
    });
    vi.mocked(putEchoChannelReadState).mockResolvedValue({
      lastReadMessageId: lastUnreadMessageId,
      channelAttention: {
        channelId,
        kind: 'dm',
        lastReadMessageId: lastUnreadMessageId,
        unreadCount: 0,
        peerUserId: '1492135186257805310',
      },
      channelAttentionByChannelId: {
        [channelId]: {
          channelId,
          kind: 'dm',
          lastReadMessageId: lastUnreadMessageId,
          unreadCount: 0,
          peerUserId: '1492135186257805310',
        },
      },
    });

    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    const activeChannelId = ref(channelId);
    const scope = effectScope();
    const history = scope.run(() => useEchoHistory(activeChannelId));
    if (!history) {
      throw new Error('useEchoHistory did not create a controller');
    }

    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(450);
    await flushMicrotasks();

    expect(putEchoChannelReadState).not.toHaveBeenCalled();

    history.reportSeenMessageId(lastUnreadMessageId);

    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(450);
    await flushMicrotasks();

    expect(putEchoChannelReadState).toHaveBeenCalledWith(
      '',
      channelId,
      lastUnreadMessageId,
    );

    scope.stop();
  });

  it('loads history for legacy dm-* thread ids', async () => {
    const channelId = 'dm-legacy-1';
    vi.mocked(fetchEchoChannelMessages).mockResolvedValue({ messages: [] });
    vi.mocked(fetchEchoAttentionSummary).mockResolvedValue({
      channelAttentionByChannelId: {},
      serverAttentionByServerId: {},
      serverNotificationLevelByServerId: {},
    });

    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    const activeChannelId = ref(channelId);
    const scope = effectScope();
    const history = scope.run(() => useEchoHistory(activeChannelId));
    if (!history) {
      throw new Error('useEchoHistory did not create a controller');
    }

    await flushMicrotasks();

    expect(fetchEchoChannelMessages).toHaveBeenCalledWith(
      'token',
      channelId,
      expect.objectContaining({ limit: expect.any(Number) }),
    );

    scope.stop();
  });

  it('does not fetch messages for optimistic dm-<userId> shell ids until the thread is registered', async () => {
    const shellId = 'dm-1492135186257805310';
    vi.mocked(fetchEchoChannelMessages).mockResolvedValue({ messages: [] });
    vi.mocked(fetchEchoAttentionSummary).mockResolvedValue({
      channelAttentionByChannelId: {},
      serverAttentionByServerId: {},
      serverNotificationLevelByServerId: {},
    });

    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    const activeChannelId = ref(shellId);
    const echoDmThreadIds = shallowRef(new Set<string>());
    const echoDmPeerByChannelId = shallowRef(new Map<string, string>());
    const scope = effectScope();
    const history = scope.run(() =>
      useEchoHistory(activeChannelId, {
        echoDmThreadIds,
        echoDmPeerByChannelId,
      }),
    );
    if (!history) {
      throw new Error('useEchoHistory did not create a controller');
    }

    await flushMicrotasks();
    expect(fetchEchoChannelMessages).not.toHaveBeenCalled();

    const realChannelId = '1492135186257805999';
    echoDmThreadIds.value = new Set([realChannelId]);
    echoDmPeerByChannelId.value = new Map([
      [realChannelId, '1492135186257805310'],
    ]);
    activeChannelId.value = realChannelId;

    await flushMicrotasks();
    expect(fetchEchoChannelMessages).toHaveBeenCalledWith(
      'token',
      realChannelId,
      expect.objectContaining({ limit: expect.any(Number) }),
    );

    scope.stop();
  });

  it('loads legacy dm-* once the id appears in the DM thread registry', async () => {
    const channelId = 'dm-legacy-2';
    vi.mocked(fetchEchoChannelMessages).mockResolvedValue({ messages: [] });
    vi.mocked(fetchEchoAttentionSummary).mockResolvedValue({
      channelAttentionByChannelId: {},
      serverAttentionByServerId: {},
      serverNotificationLevelByServerId: {},
    });

    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    const activeChannelId = ref(channelId);
    const echoDmThreadIds = shallowRef(new Set<string>());
    const echoDmPeerByChannelId = shallowRef(new Map<string, string>());
    const scope = effectScope();
    scope.run(() =>
      useEchoHistory(activeChannelId, {
        echoDmThreadIds,
        echoDmPeerByChannelId,
      }),
    );

    await flushMicrotasks();
    expect(fetchEchoChannelMessages).not.toHaveBeenCalled();

    echoDmThreadIds.value = new Set([channelId]);
    echoDmPeerByChannelId.value = new Map([[channelId, '1492135186257805310']]);
    await flushMicrotasks();

    expect(fetchEchoChannelMessages).toHaveBeenCalledWith(
      'token',
      channelId,
      expect.objectContaining({ limit: expect.any(Number) }),
    );

    scope.stop();
  });

  it('clears initial loading when the messages fetch never settles (timeout)', async () => {
    const channelId = '1492135186257805312';
    vi.mocked(fetchEchoChannelMessages).mockImplementation(
      () =>
        new Promise(() => {
          /* hung — never resolves */
        }),
    );
    vi.mocked(fetchEchoAttentionSummary).mockResolvedValue({
      channelAttentionByChannelId: {},
      serverAttentionByServerId: {},
      serverNotificationLevelByServerId: {},
    });

    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    const activeChannelId = ref(channelId);
    const scope = effectScope();
    const history = scope.run(() => useEchoHistory(activeChannelId));
    if (!history) {
      throw new Error('useEchoHistory did not create a controller');
    }

    await flushMicrotasks();
    expect(history.initialLoading.value).toBe(true);

    await vi.advanceTimersByTimeAsync(
      ECHO_HISTORY_INITIAL_FETCH_TIMEOUT_MS + 500,
    );
    await flushMicrotasks();

    expect(history.initialLoading.value).toBe(false);
    expect(history.error.value).toMatch(/timed out/i);

    scope.stop();
  });

  it('leaves a blocked stale DM route instead of trapping the user there', async () => {
    const channelId = '1492135186257805312';
    vi.mocked(fetchEchoChannelMessages).mockRejectedValue(
      new EchoApiError(403, {
        code: 'FORBIDDEN',
        message: 'You cannot open this DM.',
        detail: 'DM_USER_BLOCKED',
      }),
    );
    vi.mocked(fetchEchoAttentionSummary).mockResolvedValue({
      channelAttentionByChannelId: {},
      serverAttentionByServerId: {},
      serverNotificationLevelByServerId: {},
    });

    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    const activeChannelId = ref(channelId);
    const scope = effectScope();
    const history = scope.run(() =>
      useEchoHistory(activeChannelId, {
        echoDmThreadIds: shallowRef(new Set([channelId])),
        echoDmPeerByChannelId: shallowRef(new Map()),
      }),
    );
    if (!history) throw new Error('useEchoHistory did not create a controller');

    await flushMicrotasks();
    await flushMicrotasks();

    expect(activeChannelId.value).toBe('');
    expect(history.error.value).toBeNull();
    scope.stop();
  });

  it('does not trust cache-only DM seeds when oldest message is still optimistic', async () => {
    const channelId = '1492135186257805312';
    const pendingMessageId = 'pending-client-1';
    vi.mocked(fetchEchoChannelMessages).mockResolvedValue({ messages: [] });
    vi.mocked(fetchEchoAttentionSummary).mockResolvedValue({
      channelAttentionByChannelId: {},
      serverAttentionByServerId: {},
      serverNotificationLevelByServerId: {},
    });

    const pendingList = [] as Array<{
      channelId: string;
      clientMessageId: string;
      authorId: string;
      createdAtMs: number;
      replyToId?: string;
    }>;
    registerEchoPendingClientMessageList(pendingList);
    recordPendingClientMessage(
      pendingList,
      {
        channelId,
        clientMessageId: pendingMessageId,
        authorId: '1492135186257805310',
      },
      Date.now(),
    );

    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    replaceChannelMessagesFromHistory(channelId, [
      {
        id: pendingMessageId,
        authorId: '1492135186257805310',
        authorDisplayName: 'Ada',
        authorAvatar: '',
        timestamp: '2026-04-10T12:00:00.000Z',
        content: 'optimistic',
      },
    ]);
    const activeChannelId = ref(channelId);
    const scope = effectScope();
    const history = scope.run(() => useEchoHistory(activeChannelId));
    if (!history) {
      throw new Error('useEchoHistory did not create a controller');
    }

    await flushMicrotasks();

    expect(fetchEchoChannelMessages).toHaveBeenCalledWith(
      'token',
      channelId,
      expect.objectContaining({ limit: expect.any(Number) }),
    );

    scope.stop();
  });

  it('reveals a 15-message fast tail then prepends one 25-message backfill', async () => {
    const channelId = '1492135186257805312';
    const fastTail = Array.from({ length: 15 }, (_, index) =>
      apiMessage(
        `1492135186257806${String(index).padStart(3, '0')}`,
        channelId,
      ),
    );
    const older = Array.from({ length: 25 }, (_, index) =>
      apiMessage(
        `1492135186257805${String(index).padStart(3, '0')}`,
        channelId,
      ),
    );
    vi.mocked(fetchEchoChannelMessages).mockImplementation(
      async (_token, _channelId, opts) => ({
        messages: opts?.before ? older : fastTail,
      }),
    );
    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    const activeChannelId = ref(channelId);
    const scope = effectScope();
    const history = scope.run(() => useEchoHistory(activeChannelId))!;

    await flushMicrotasks();
    expect(fetchEchoChannelMessages).toHaveBeenNthCalledWith(
      1,
      'token',
      channelId,
      expect.objectContaining({ limit: 15 }),
    );
    expect(messages.value[channelId]).toHaveLength(15);
    expect(history.initialLoading.value).toBe(false);

    await expect(history.loadInitialBackfill()).resolves.toBe(true);
    expect(fetchEchoChannelMessages).toHaveBeenNthCalledWith(
      2,
      'token',
      channelId,
      expect.objectContaining({
        before: fastTail[0]!.id,
        limit: 25,
      }),
    );
    expect(messages.value[channelId]).toHaveLength(40);
    expect(history.hasMoreOlder.value).toBe(true);
    scope.stop();
  });

  it('skips initial backfill when the fast tail reaches the history boundary', async () => {
    const channelId = '1492135186257805312';
    vi.mocked(fetchEchoChannelMessages).mockResolvedValue({
      messages: Array.from({ length: 14 }, (_, index) =>
        apiMessage(
          `1492135186257806${String(index).padStart(3, '0')}`,
          channelId,
        ),
      ),
    });
    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    const scope = effectScope();
    const history = scope.run(() => useEchoHistory(ref(channelId)))!;

    await flushMicrotasks();
    expect(history.hasMoreOlder.value).toBe(false);
    await expect(history.loadInitialBackfill()).resolves.toBe(false);
    expect(fetchEchoChannelMessages).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it('keeps the 40-message path for a saved non-bottom viewport', async () => {
    const channelId = '1492135186257805312';
    writeMessageListViewport(channelId, {
      anchorMessageId: '1492135186257805000',
      anchorTop: 120,
      followNewMessages: false,
    });
    vi.mocked(fetchEchoChannelMessages).mockResolvedValue({ messages: [] });
    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    const scope = effectScope();
    const history = scope.run(() => useEchoHistory(ref(channelId)))!;

    await flushMicrotasks();
    expect(fetchEchoChannelMessages).toHaveBeenCalledWith(
      'token',
      channelId,
      expect.objectContaining({ limit: 40 }),
    );
    expect(history.initialBackfillPending.value).toBe(false);
    scope.stop();
  });

  it('discards an in-flight initial backfill when the channel changes', async () => {
    const channelId = '1492135186257805312';
    const fastTail = Array.from({ length: 15 }, (_, index) =>
      apiMessage(
        `1492135186257806${String(index).padStart(3, '0')}`,
        channelId,
      ),
    );
    vi.mocked(fetchEchoChannelMessages).mockImplementation(
      async (_token, _channelId, opts) => {
        if (!opts?.before) return { messages: fastTail };
        return new Promise((resolve, reject) => {
          opts.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      },
    );
    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    const activeChannelId = ref(channelId);
    const scope = effectScope();
    const history = scope.run(() => useEchoHistory(activeChannelId))!;

    await flushMicrotasks();
    const pending = history.loadInitialBackfill();
    activeChannelId.value = '';
    await flushMicrotasks();
    await expect(pending).resolves.toBe(false);
    expect(messages.value[channelId]).toHaveLength(15);
    expect(history.initialBackfillLoading.value).toBe(false);
    scope.stop();
  });

  it('keeps ordinary pagination retryable after initial backfill failure', async () => {
    const channelId = '1492135186257805312';
    const fastTail = Array.from({ length: 15 }, (_, index) =>
      apiMessage(
        `1492135186257806${String(index).padStart(3, '0')}`,
        channelId,
      ),
    );
    vi.mocked(fetchEchoChannelMessages)
      .mockResolvedValueOnce({ messages: fastTail })
      .mockRejectedValueOnce(new Error('background backfill failed'))
      .mockResolvedValueOnce({
        messages: [apiMessage('1492135186257805000', channelId)],
      });
    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    const scope = effectScope();
    const history = scope.run(() => useEchoHistory(ref(channelId)))!;

    await flushMicrotasks();
    await expect(history.loadInitialBackfill()).resolves.toBe(false);
    expect(history.hasMoreOlder.value).toBe(true);
    await expect(history.loadOlder()).resolves.toBe(true);
    expect(fetchEchoChannelMessages).toHaveBeenLastCalledWith(
      'token',
      channelId,
      expect.objectContaining({ limit: 80 }),
    );
    scope.stop();
  });
});
