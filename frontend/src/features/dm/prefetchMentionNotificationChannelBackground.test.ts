import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { EchoApiMessage } from '@/api/echo/messages';
import { bindChannelMessageBuckets } from '@/services/realtime/channelMessageAuthority';
import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import { prefetchMentionNotificationChannelBackground } from './prefetchMentionNotificationChannels';

const fetchEchoChannelMessage = vi.fn();
const fetchEchoChannelMessages = vi.fn();

vi.mock('@/api/echo/messages', () => ({
  fetchEchoChannelMessage: (...args: unknown[]) =>
    fetchEchoChannelMessage(...args),
  fetchEchoChannelMessages: (...args: unknown[]) =>
    fetchEchoChannelMessages(...args),
}));

function bridgedApiMessage(
  partial: Partial<EchoApiMessage> & Pick<EchoApiMessage, 'id'>,
): EchoApiMessage {
  return {
    channelId: '00000000-0000-4000-8000-000000000010',
    authorId: 'author-1',
    content: 'hey @you',
    timestamp: '2026-06-06T12:00:00.000Z',
    bridgeFromDiscord: true,
    ...partial,
  };
}

describe('prefetchMentionNotificationChannelBackground', () => {
  const channelId = '00000000-0000-4000-8000-000000000010';
  const anchorId = '1420070400000000001';

  beforeEach(() => {
    vi.clearAllMocks();
    bindChannelMessageBuckets(
      ref<Record<string, RawMessage[]>>({
        [channelId]: [
          {
            id: '1420070400000000000',
            authorId: 'author-0',
            timestamp: '2026-06-06T11:00:00.000Z',
            content: 'older cached row',
          },
        ],
      }),
    );
    fetchEchoChannelMessage.mockRejectedValue(new Error('not found'));
    fetchEchoChannelMessages.mockResolvedValue({
      messages: [bridgedApiMessage({ id: anchorId })],
    });
  });

  it('refreshes the latest page when the anchor is newer than the cached head', async () => {
    await prefetchMentionNotificationChannelBackground('token', {
      channelId,
      anchorMessageId: anchorId,
    });

    expect(fetchEchoChannelMessages).toHaveBeenCalledWith('token', channelId, {
      limit: expect.any(Number),
    });
    expect(fetchEchoChannelMessages).not.toHaveBeenCalledWith(
      'token',
      channelId,
      expect.objectContaining({ before: expect.any(String) }),
    );
  });
});
