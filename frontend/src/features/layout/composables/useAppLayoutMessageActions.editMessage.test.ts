import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { useAppLayoutMessageActions } from './useAppLayoutMessageActions';
import { failResult, okResult } from '@/types/actionResult';
import * as actionFailurePropagation from '@/utils/actionFailurePropagation';

vi.mock('@/stores/authSession', () => ({
  useAuthSessionStore: () => ({
    isAuthenticated: false,
    backendUser: undefined as { id: string } | undefined,
  }),
}));

vi.mock('@/stores/echoSession', () => ({
  useEchoSessionStore: () => ({
    patchPresence: vi.fn(),
  }),
}));

describe('useAppLayoutMessageActions editMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when active channel has no message list', async () => {
    const activeChannelId = ref('ch-1');
    const messages = ref<Record<string, RawMessage[]>>({});
    const { editMessage } = useAppLayoutMessageActions({
      activeChannelId,
      currentUser: ref({ id: 'u1' }),
      users: ref([]),
      messages,
      votePoll: vi.fn(),
      toggleReaction: vi.fn(),
      recordReaction: vi.fn(),
      clearSearch: vi.fn(),
      onSelectServerForChannel: vi.fn(),
      onSelectDmUser: vi.fn(),
      isMockDataMode: false,
      submitEchoMessageEdit: vi.fn(() => okResult()),
      getActiveChatMessageNav: () => null,
    });
    await expect(editMessage('m1', 'x')).resolves.toBe(false);
  });

  it('returns false and calls propagateActionFailure when submit returns !ok', async () => {
    const spy = vi.spyOn(actionFailurePropagation, 'propagateActionFailure');
    const channelId = '88888888-8888-4888-8888-888888888888';
    const messageId = '77777777-7777-4777-7777-777777777777';
    const activeChannelId = ref(channelId);
    const original: RawMessage = {
      id: messageId,
      authorId: 'a1',
      timestamp: new Date().toISOString(),
      content: 'before',
    };
    const messages = ref<Record<string, RawMessage[]>>({
      [channelId]: [original],
    });
    const submitEchoMessageEdit = vi.fn(() =>
      Promise.resolve(
        failResult('SOCKET_DISCONNECTED', 'Realtime is not connected.', true),
      ),
    );
    const rollbackTransaction = vi.fn();
    const beginTransaction = vi.fn();
    const { editMessage } = useAppLayoutMessageActions({
      activeChannelId,
      currentUser: ref({ id: 'u1' }),
      users: ref([]),
      messages,
      votePoll: vi.fn(),
      toggleReaction: vi.fn(),
      recordReaction: vi.fn(),
      clearSearch: vi.fn(),
      onSelectServerForChannel: vi.fn(),
      onSelectDmUser: vi.fn(),
      isMockDataMode: false,
      submitEchoMessageEdit,
      uiTransactions: {
        beginTransaction,
        rollbackTransaction,
        register: vi.fn(),
        getPending: vi.fn(),
        commitTransaction: vi.fn(),
        commitPendingReactionTogglesForMessage: vi.fn(),
        commitPendingMessageEditForMessage: vi.fn(),
        commitPendingMessageDeleteForMessage: vi.fn(),
        commitPendingPinMutationsForChannel: vi.fn(),
      },
      isLiveSocketReady: () => true,
      getActiveChatMessageNav: () => null,
    });

    await expect(editMessage(messageId, 'after')).resolves.toBe(false);
    expect(submitEchoMessageEdit).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false }),
      expect.objectContaining({
        flow: 'socket.message_edit',
        context: 'message_edit',
      }),
    );
    expect(beginTransaction).toHaveBeenCalledTimes(1);
    const tx = beginTransaction.mock.calls[0]![0] as { id: string };
    expect(rollbackTransaction).toHaveBeenCalledWith(tx.id);
  });

  it('returns true and applies optimistic update when submit succeeds with live tx', async () => {
    const channelId = '88888888-8888-4888-8888-888888888888';
    const messageId = '77777777-7777-4777-7777-777777777777';
    const activeChannelId = ref(channelId);
    const messages = ref<Record<string, RawMessage[]>>({
      [channelId]: [
        {
          id: messageId,
          authorId: 'a1',
          timestamp: new Date().toISOString(),
          content: 'before',
        },
      ],
    });
    const submitEchoMessageEdit = vi.fn(() => Promise.resolve(okResult()));
    const { editMessage } = useAppLayoutMessageActions({
      activeChannelId,
      currentUser: ref({ id: 'u1' }),
      users: ref([]),
      messages,
      votePoll: vi.fn(),
      toggleReaction: vi.fn(),
      recordReaction: vi.fn(),
      clearSearch: vi.fn(),
      onSelectServerForChannel: vi.fn(),
      onSelectDmUser: vi.fn(),
      isMockDataMode: false,
      submitEchoMessageEdit,
      uiTransactions: {
        beginTransaction: vi.fn(),
        rollbackTransaction: vi.fn(),
        register: vi.fn(),
        getPending: vi.fn(),
        commitTransaction: vi.fn(),
        commitPendingReactionTogglesForMessage: vi.fn(),
        commitPendingMessageEditForMessage: vi.fn(),
        commitPendingMessageDeleteForMessage: vi.fn(),
        commitPendingPinMutationsForChannel: vi.fn(),
      },
      isLiveSocketReady: () => true,
      getActiveChatMessageNav: () => null,
    });

    await expect(editMessage(messageId, 'after')).resolves.toBe(true);
    expect(messages.value[channelId]![0]!.content).toBe('after');
    expect(messages.value[channelId]![0]!.editedAt).toBeTruthy();
  });

  it('returns true and updates list when socket not live (no tx) and submit ok', async () => {
    const channelId = '88888888-8888-4888-8888-888888888888';
    const messageId = '77777777-7777-4777-7777-777777777777';
    const activeChannelId = ref(channelId);
    const messages = ref<Record<string, RawMessage[]>>({
      [channelId]: [
        {
          id: messageId,
          authorId: 'a1',
          timestamp: new Date().toISOString(),
          content: 'before',
        },
      ],
    });
    const submitEchoMessageEdit = vi.fn(() => okResult());
    const { editMessage } = useAppLayoutMessageActions({
      activeChannelId,
      currentUser: ref({ id: 'u1' }),
      users: ref([]),
      messages,
      votePoll: vi.fn(),
      toggleReaction: vi.fn(),
      recordReaction: vi.fn(),
      clearSearch: vi.fn(),
      onSelectServerForChannel: vi.fn(),
      onSelectDmUser: vi.fn(),
      isMockDataMode: false,
      submitEchoMessageEdit,
      uiTransactions: {
        beginTransaction: vi.fn(),
        rollbackTransaction: vi.fn(),
        register: vi.fn(),
        getPending: vi.fn(),
        commitTransaction: vi.fn(),
        commitPendingReactionTogglesForMessage: vi.fn(),
        commitPendingMessageEditForMessage: vi.fn(),
        commitPendingMessageDeleteForMessage: vi.fn(),
        commitPendingPinMutationsForChannel: vi.fn(),
      },
      isLiveSocketReady: () => false,
      getActiveChatMessageNav: () => null,
    });

    await expect(editMessage(messageId, 'local')).resolves.toBe(true);
    expect(messages.value[channelId]![0]!.content).toBe('local');
  });
});
