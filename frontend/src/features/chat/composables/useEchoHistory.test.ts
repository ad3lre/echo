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

    expect(fetchEchoChannelMessages).toHaveBeenCalledWith('token', channelId, {
      limit: expect.any(Number),
    });

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
      { limit: expect.any(Number) },
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

    expect(fetchEchoChannelMessages).toHaveBeenCalledWith('token', channelId, {
      limit: expect.any(Number),
    });

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

    expect(fetchEchoChannelMessages).toHaveBeenCalledWith('token', channelId, {
      limit: expect.any(Number),
    });

    scope.stop();
  });
});
