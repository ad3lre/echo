import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { useAppLayoutMessageActions } from './useAppLayoutMessageActions';
import { okResult } from '@/types/actionResult';

vi.mock('@/stores/authSession', () => ({
  useAuthSessionStore: () => ({
    isAuthenticated: false,
    backendUser: undefined as { id: string } | undefined,
  }),
}));

describe('useAppLayoutMessageActions goToMessage (search/pins / registry path)', () => {
  it('handleGoToMessage selects channel, prefetches, and scrolls via MessageList bridge', async () => {
    const channelId = '88888888-8888-4888-8888-888888888888';
    const messageId = '77777777-7777-4777-7777-777777777777';
    const activeChannelId = ref('other-channel');
    const messages = ref<Record<string, RawMessage[]>>({
      [channelId]: [
        {
          id: messageId,
          authorId: 'author-1',
          timestamp: new Date().toISOString(),
          content: 'hello',
        },
      ],
    });

    const scrollToMessage = vi.fn(async () => true);
    const prefetchEchoMessage = vi.fn(async () => okResult());
    const clearSearch = vi.fn();
    const onSelectServerForChannel = vi.fn();

    const { handleGoToMessage } = useAppLayoutMessageActions({
      activeChannelId,
      currentUser: ref({ id: 'user-1' }),
      users: ref([]),
      messages,
      votePoll: vi.fn(),
      toggleReaction: vi.fn(),
      recordReaction: vi.fn(),
      clearSearch,
      onSelectServerForChannel,
      onSelectDmUser: vi.fn(),
      getActiveChatMessageNav: () => ({
        scrollToMessage,
        flashHighlight: vi.fn(),
      }),
      prefetchEchoMessage,
    });

    handleGoToMessage(channelId, messageId);

    await vi.waitFor(() => {
      expect(prefetchEchoMessage).toHaveBeenCalledWith(channelId, messageId);
    });
    await vi.waitFor(() => {
      expect(scrollToMessage).toHaveBeenCalledWith(messageId);
    });

    expect(activeChannelId.value).toBe(channelId);
    expect(clearSearch).toHaveBeenCalled();
  });

  it('opens guild channel via workspace server id (avoids mis-parsing UUID as serverId-local)', async () => {
    const channelId = '550e8400-e29b-41d4-a716-446655440000';
    const serverId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const messageId = '77777777-7777-4777-7777-777777777777';
    const activeChannelId = ref('other-channel');
    const messages = ref<Record<string, RawMessage[]>>({
      [channelId]: [
        {
          id: messageId,
          authorId: 'author-1',
          timestamp: new Date().toISOString(),
          content: 'hello',
        },
      ],
    });
    const openServerChannel = vi.fn();
    const onSelectServerForChannel = vi.fn();
    const { handleGoToMessage } = useAppLayoutMessageActions({
      activeChannelId,
      currentUser: ref({ id: 'user-1' }),
      users: ref([]),
      messages,
      votePoll: vi.fn(),
      toggleReaction: vi.fn(),
      recordReaction: vi.fn(),
      clearSearch: vi.fn(),
      onSelectServerForChannel,
      onSelectDmUser: vi.fn(),
      onOpenServerChannel: openServerChannel,
      resolveGuildServerIdForChannel: () => serverId,
      getActiveChatMessageNav: () => ({
        scrollToMessage: vi.fn(async () => true),
        flashHighlight: vi.fn(),
      }),
      prefetchEchoMessage: vi.fn(async () => okResult()),
    });
    handleGoToMessage(channelId, messageId);
    await vi.waitFor(() => {
      expect(openServerChannel).toHaveBeenCalledWith(serverId, channelId);
    });
    expect(onSelectServerForChannel).not.toHaveBeenCalled();
  });

  it('routes legacy dm-* to peer selection, not guild server "dm"', async () => {
    const channelId = 'dm-user-999';
    const messageId = 'm1';
    const activeChannelId = ref('x');
    const onSelectDmUser = vi.fn();
    const openServerChannel = vi.fn();
    const { handleGoToMessage } = useAppLayoutMessageActions({
      activeChannelId,
      currentUser: ref({ id: 'u' }),
      users: ref([]),
      messages: ref({
        [channelId]: [
          {
            id: messageId,
            authorId: 'a',
            timestamp: new Date().toISOString(),
            content: 'p',
          },
        ],
      }),
      votePoll: vi.fn(),
      toggleReaction: vi.fn(),
      recordReaction: vi.fn(),
      clearSearch: vi.fn(),
      onSelectServerForChannel: vi.fn(),
      onSelectDmUser,
      onOpenServerChannel: openServerChannel,
      getActiveChatMessageNav: () => ({
        scrollToMessage: vi.fn(async () => true),
        flashHighlight: vi.fn(),
      }),
      prefetchEchoMessage: vi.fn(async () => okResult()),
    });
    handleGoToMessage(channelId, messageId);
    await vi.waitFor(() =>
      expect(onSelectDmUser).toHaveBeenCalledWith('user-999'),
    );
    expect(openServerChannel).not.toHaveBeenCalled();
    expect(activeChannelId.value).toBe(channelId);
  });
});
