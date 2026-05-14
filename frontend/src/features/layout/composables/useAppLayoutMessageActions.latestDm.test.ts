import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { useAppLayoutMessageActions } from './useAppLayoutMessageActions';

vi.mock('@/stores/authSession', () => ({
  useAuthSessionStore: () => ({
    isAuthenticated: false,
    backendUser: undefined as { id: string } | undefined,
  }),
}));

describe('useAppLayoutMessageActions getLatestDMUserId', () => {
  it('returns the peer with the most recent DM activity across legacy and persisted channels', () => {
    const { getLatestDMUserId } = useAppLayoutMessageActions({
      activeChannelId: ref('general'),
      currentUser: ref({ id: 'self' }),
      users: ref([{ id: 'older-peer' }, { id: 'newer-peer' }]),
      messages: ref<Record<string, RawMessage[]>>({
        'dm-older-peer': [
          {
            id: 'm-1',
            authorId: 'older-peer',
            timestamp: '2026-01-01T00:00:00.000Z',
            content: 'older',
          },
        ],
        persistedDm: [
          {
            id: 'm-2',
            authorId: 'newer-peer',
            timestamp: '2026-01-02T00:00:00.000Z',
            content: 'newer',
          },
        ],
      }),
      votePoll: vi.fn(),
      toggleReaction: vi.fn(),
      recordReaction: vi.fn(),
      clearSearch: vi.fn(),
      onSelectServerForChannel: vi.fn(),
      onSelectDmUser: vi.fn(),
      resolveEchoDmPeer: (channelId) =>
        channelId === 'persistedDm' ? 'newer-peer' : null,
      getActiveChatMessageNav: () => null,
    });

    expect(getLatestDMUserId()).toBe('newer-peer');
  });
});
