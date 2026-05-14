import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { RawMessage } from './useChatMessages';
import { useMessageReactions } from './useMessageReactions';
import { createUiTransactionManager } from '@/ui/transactions/TransactionManager';
import { failResult, okResult } from '@/types/actionResult';
import {
  bindChannelMessageBuckets,
  restoreChannelMessageReactions,
} from '@/services/realtime/channelMessageAuthority';
import { _resetAllIndexesForTesting } from '@/features/chat/domain/channelMessageIndex';

function registerReactionRollback(
  uiTx: ReturnType<typeof createUiTransactionManager>,
) {
  uiTx.register('reaction-toggle', {
    rollback(tx) {
      if (tx.type !== 'reaction-toggle') return;
      restoreChannelMessageReactions(
        tx.channelId,
        tx.messageId,
        tx.previousReactions,
      );
    },
    commit() {},
  });
}

describe('useMessageReactions', () => {
  beforeEach(() => {
    _resetAllIndexesForTesting();
  });

  it('adds new reaction', async () => {
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [{ id: 'm1', authorId: 'a', timestamp: 't', content: '' }],
    });
    bindChannelMessageBuckets(messages);
    const { toggleReaction } = useMessageReactions(messages);
    await toggleReaction('c1', 'm1', '👍', 'u1');
    expect(messages.value.c1![0]!.reactions).toHaveLength(1);
    expect(messages.value.c1![0]!.reactions?.[0]).toMatchObject({
      emoji: '👍',
      count: 1,
      userIds: ['u1'],
    });
    expect(messages.value.c1![0]!.reactions?.[0]?.lastReactionAt).toEqual(
      expect.any(String),
    );
  });

  it('removes user from existing reaction', async () => {
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [
        {
          id: 'm1',
          authorId: 'a',
          timestamp: 't',
          content: '',
          reactions: [{ emoji: '🔥', count: 1, userIds: ['u1'] }],
        },
      ],
    });
    bindChannelMessageBuckets(messages);
    const { toggleReaction } = useMessageReactions(messages);
    await toggleReaction('c1', 'm1', '🔥', 'u1');
    expect(messages.value.c1![0]!.reactions).toBeUndefined();
  });

  it('no-ops when message missing', async () => {
    const messages = ref<Record<string, RawMessage[]>>({ c1: [] });
    bindChannelMessageBuckets(messages);
    const { toggleReaction } = useMessageReactions(messages);
    await toggleReaction('c1', 'nope', '👍', 'u1');
    expect(messages.value.c1).toEqual([]);
  });

  it('does not mutate when realtime is not ready but emit is configured', async () => {
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [{ id: 'm1', authorId: 'a', timestamp: 't', content: '' }],
    });
    bindChannelMessageBuckets(messages);
    const emit = vi.fn(() => okResult());
    const { toggleReaction } = useMessageReactions(messages, {
      isLiveReactionReady: () => false,
      emitReactionToggle: emit,
    });
    await toggleReaction('c1', 'm1', '👍', 'u1');
    expect(emit).not.toHaveBeenCalled();
    expect(messages.value.c1![0]!.reactions).toBeUndefined();
  });

  it('rolls back optimistic toggle when emit reports failure', async () => {
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [{ id: 'm1', authorId: 'a', timestamp: 't', content: '' }],
    });
    bindChannelMessageBuckets(messages);
    const uiTx = createUiTransactionManager();
    registerReactionRollback(uiTx);
    const { toggleReaction } = useMessageReactions(messages, {
      uiTransactions: uiTx,
      isLiveReactionReady: () => true,
      emitReactionToggle: () =>
        failResult('SOCKET_ADAPTER_MISSING', 'not ready', true),
    });
    await toggleReaction('c1', 'm1', '👍', 'u1');
    expect(messages.value.c1![0]!.reactions).toBeUndefined();
  });
});
