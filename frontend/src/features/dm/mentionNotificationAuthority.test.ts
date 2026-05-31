import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EchoAttentionChannelSummary } from '@shared/types';
import { bindChannelMessageBuckets } from '@/services/realtime/channelMessageAuthority';
import { messageReadFacade } from '@/features/chat/domain/messageReadFacade';
import {
  applyMentionNotificationHydrationFailures,
  buildAttentionStubMentionRows,
  collectMentionNotificationsFromAuthority,
  MENTION_NOTIFICATION_FAILED_PREVIEW,
  MENTION_NOTIFICATION_STUB_PREVIEW,
  resolveMentionNotificationScanChannelIds,
} from './mentionNotificationAuthority';

vi.mock(
  '@/services/realtime/channelMessageAuthority',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/services/realtime/channelMessageAuthority')
      >();
    return {
      ...actual,
      hasChannelMessageInBucket: vi.fn(() => false),
    };
  },
);

function serverSummary(
  partial: Partial<EchoAttentionChannelSummary> &
    Pick<EchoAttentionChannelSummary, 'channelId'>,
): EchoAttentionChannelSummary {
  return {
    kind: 'server',
    lastReadMessageId: null,
    unreadCount: 1,
    serverId: 'server-1',
    pingKind: 'personal',
    latestUnreadMessageId: 'msg-100',
    latestUnreadMessageAt: '2026-05-31T12:00:00.000Z',
    ...partial,
  };
}

describe('mentionNotificationAuthority', () => {
  beforeEach(() => {
    const messages = ref<
      Record<
        string,
        import('@/services/realtime/chatMessageTypes').RawMessage[]
      >
    >({});
    bindChannelMessageBuckets(messages);
    messageReadFacade.globalResolverVersion.value = 0;
  });

  it('includes attention channels with unread pings even when not cached locally', () => {
    const channelId = '00000000-0000-4000-8000-000000000010';
    const ids = resolveMentionNotificationScanChannelIds({
      channelAttentionByChannelId: {
        [channelId]: serverSummary({ channelId }),
      },
      readStateByChannelId: {},
      serverNotificationLevelByServerId: { 'server-1': 'mentions' },
    });

    expect(ids).toEqual([channelId]);
  });

  it('builds stub rows from attention when anchor message is not local', () => {
    const channelId = '00000000-0000-4000-8000-000000000010';
    const rows = buildAttentionStubMentionRows({
      channelAttentionByChannelId: {
        [channelId]: serverSummary({ channelId }),
      },
      readStateByChannelId: {},
      serverNotificationLevelByServerId: { 'server-1': 'mentions' },
      resolveChannelLabel: () => 'general',
    });

    expect(rows).toEqual([
      expect.objectContaining({
        channelId,
        messageId: 'msg-100',
        channelLabel: 'general',
        preview: MENTION_NOTIFICATION_STUB_PREVIEW,
      }),
    ]);
  });

  it('applyMentionNotificationHydrationFailures replaces unresolved stub previews', () => {
    const channelId = '00000000-0000-4000-8000-000000000012';
    const rows = buildAttentionStubMentionRows({
      channelAttentionByChannelId: {
        [channelId]: serverSummary({ channelId }),
      },
      readStateByChannelId: {},
      serverNotificationLevelByServerId: { 'server-1': 'mentions' },
      resolveChannelLabel: () => 'general',
    });

    const failed = applyMentionNotificationHydrationFailures(
      rows,
      new Set([channelId]),
    );

    expect(failed[0]?.preview).toBe(MENTION_NOTIFICATION_FAILED_PREVIEW);
  });

  it('collectMentionNotificationsFromAuthority merges stubs with cached mention rows', () => {
    const channelId = '00000000-0000-4000-8000-000000000011';
    const messages = ref<
      Record<
        string,
        import('@/services/realtime/chatMessageTypes').RawMessage[]
      >
    >({
      [channelId]: [
        {
          id: 'msg-200',
          authorId: 'author-1',
          timestamp: '2026-05-31T13:00:00.000Z',
          content: 'hello @you',
          mentions: [
            {
              id: 'm1',
              kind: 'user',
              label: 'you',
              userId: 'self-1',
              start: 6,
              end: 10,
            },
          ],
        },
      ],
    });
    bindChannelMessageBuckets(messages);

    const rows = collectMentionNotificationsFromAuthority({
      channelAttentionByChannelId: {},
      readStateByChannelId: {},
      serverNotificationLevelByServerId: {},
      selfUserId: 'self-1',
      resolveChannelLabel: () => 'dm',
      resolveUserName: () => 'Alex',
      maxItems: 10,
    });

    expect(rows).toEqual([
      expect.objectContaining({
        channelId,
        messageId: 'msg-200',
        authorName: 'Alex',
      }),
    ]);
  });
});
