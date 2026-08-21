import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EchoAttentionChannelSummary } from '@shared/types';
import { bindChannelMessageBuckets } from '@/features/chat/domain/channelMessageAuthority';
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
  '@/features/chat/domain/channelMessageAuthority',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/chat/domain/channelMessageAuthority')
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
      Record<string, import('@/features/chat/chatMessageTypes').RawMessage[]>
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

  it('drops attention stubs when the channel already has a resolved cached mention row', () => {
    const channelId = '00000000-0000-4000-8000-000000000012';
    const messages = ref<
      Record<string, import('@/features/chat/chatMessageTypes').RawMessage[]>
    >({
      [channelId]: [
        {
          id: '1420070400000000001',
          authorId: 'author-1',
          timestamp: '2026-06-06T12:00:00.000Z',
          content: 'hey @you from discord',
          bridgeFromDiscord: true,
          mentions: [
            {
              id: 'm1',
              kind: 'user',
              label: 'you',
              userId: 'self-1',
              start: 4,
              end: 8,
            },
          ],
        },
        {
          id: '1420070400000000099',
          authorId: 'author-2',
          timestamp: '2026-06-06T12:01:00.000Z',
          content: 'plain follow-up',
          bridgeFromDiscord: true,
        },
      ],
    });
    bindChannelMessageBuckets(messages);

    const rows = collectMentionNotificationsFromAuthority({
      channelAttentionByChannelId: {
        [channelId]: serverSummary({
          channelId,
          latestUnreadMessageId: '1420070400000000099',
        }),
      },
      readStateByChannelId: {},
      serverNotificationLevelByServerId: { 'server-1': 'mentions' },
      selfUserId: 'self-1',
      resolveChannelLabel: () => 'bridge',
      resolveUserName: () => 'Ada',
      maxItems: 10,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.messageId).toBe('1420070400000000001');
    expect(rows[0]?.preview).not.toBe(MENTION_NOTIFICATION_STUB_PREVIEW);
  });

  it('collectMentionNotificationsFromAuthority merges stubs with cached mention rows', () => {
    const channelId = '00000000-0000-4000-8000-000000000011';
    const messages = ref<
      Record<string, import('@/features/chat/chatMessageTypes').RawMessage[]>
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
