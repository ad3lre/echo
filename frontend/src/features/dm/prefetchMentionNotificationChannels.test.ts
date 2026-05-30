import { describe, expect, it } from 'vitest';
import type { EchoAttentionChannelSummary } from '@shared/types';
import { resolveMentionNotificationPrefetchTargets } from './prefetchMentionNotificationChannels';

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
    ...partial,
  };
}

describe('resolveMentionNotificationPrefetchTargets', () => {
  it('prefetches channels with unread personal pings and empty local cache', () => {
    const channelId = '00000000-0000-4000-8000-000000000010';
    const targets = resolveMentionNotificationPrefetchTargets({
      channelAttentionByChannelId: {
        [channelId]: serverSummary({ channelId }),
      },
      readStateByChannelId: {},
      serverNotificationLevelByServerId: { 'server-1': 'mentions' },
      messagesByChannelId: {},
    });

    expect(targets).toEqual([{ channelId, anchorMessageId: 'msg-100' }]);
  });

  it('skips channels that already have cached messages and no unread ping', () => {
    const channelId = '00000000-0000-4000-8000-000000000011';
    const targets = resolveMentionNotificationPrefetchTargets({
      channelAttentionByChannelId: {
        [channelId]: serverSummary({
          channelId,
          unreadCount: 0,
          pingKind: undefined,
        }),
      },
      readStateByChannelId: { [channelId]: 'msg-999' },
      serverNotificationLevelByServerId: { 'server-1': 'mentions' },
      messagesByChannelId: { [channelId]: [{ id: 'msg-1' }] },
    });

    expect(targets).toEqual([]);
  });
});
