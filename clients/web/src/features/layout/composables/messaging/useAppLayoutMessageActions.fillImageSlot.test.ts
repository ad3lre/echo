import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { useAppLayoutMessageActions } from './useAppLayoutMessageActions';
import { _resetAllIndexesForTesting } from '@/features/chat/domain/channelMessageIndex';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import { bindChannelMessageBuckets } from '@/features/chat/domain/channelMessageAuthority';
import { okResult } from '@/features/layout/actionResult';
import { isImageSlotFilled } from '@shared/imageSlot';
import { walkImageSlots } from '@shared/imageSlotContentJson';

vi.mock('@/features/auth/authSession', () => ({
  useAuthSessionStore: () => ({
    isAuthenticated: false,
    backendUser: undefined as { id: string } | undefined,
  }),
}));

vi.mock('@/features/layout/echoSession', () => ({
  useEchoSessionStore: () => ({
    patchPresence: vi.fn(),
  }),
}));

const emptySlotDoc = {
  type: 'doc',
  content: [
    {
      type: 'imageSlot',
      attrs: {
        slotId: 'slot-1',
        aspectW: 16,
        aspectH: 9,
        imageUrl: null,
        storageKey: null,
        width: null,
        height: null,
      },
    },
  ],
};

describe('useAppLayoutMessageActions fillImageSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetAllIndexesForTesting();
    messageWindowAuthority.clearWorkspaceMessagesRecord();
  });

  it('syncs the active message window so filled slots render immediately', async () => {
    const channelId = '88888888-8888-4888-8888-888888888888';
    const messageId = '77777777-7777-4777-7777-777777777777';
    const activeChannelId = ref(channelId);
    const messages = ref<Record<string, RawMessage[]>>({
      [channelId]: [
        {
          id: messageId,
          authorId: 'a1',
          timestamp: new Date().toISOString(),
          content: '![image: ratio=16:9, slotId=slot-1]',
          messageFormatVersion: 2,
          contentSchemaVersion: 2,
          contentJson: emptySlotDoc,
        },
      ],
    });
    bindChannelMessageBuckets(messages);
    messageWindowAuthority.setActiveChannel(channelId);

    const submitEchoImageSlotFill = vi.fn(() => Promise.resolve(okResult()));
    const { fillImageSlot } = useAppLayoutMessageActions({
      activeChannelId,
      currentUser: ref({ id: 'a1' }),
      users: ref([]),
      messages,
      votePoll: vi.fn(),
      toggleReaction: vi.fn(),
      recordReaction: vi.fn(),
      clearSearch: vi.fn(),
      onSelectServerForChannel: vi.fn(),
      onSelectDmUser: vi.fn(),
      isMockDataMode: false,
      submitEchoImageSlotFill,
      getActiveChatMessageNav: () => null,
    });

    await expect(
      fillImageSlot(messageId, 'slot-1', {
        imageUrl: 'https://cdn.example.com/a.png',
        width: 640,
        height: 360,
      }),
    ).resolves.toBe(true);

    const bucketSlot = walkImageSlots(
      messages.value[channelId]![0]!.contentJson,
    )[0];
    expect(isImageSlotFilled(bucketSlot!)).toBe(true);
    expect(bucketSlot?.imageUrl).toBe('https://cdn.example.com/a.png');

    const entity = messageWindowAuthority.entitiesById.value.get(messageId);
    const windowSlot = walkImageSlots(entity?.contentJson)[0];
    expect(isImageSlotFilled(windowSlot!)).toBe(true);
    expect(windowSlot?.imageUrl).toBe('https://cdn.example.com/a.png');
    expect(submitEchoImageSlotFill).toHaveBeenCalledTimes(1);
  });
});
