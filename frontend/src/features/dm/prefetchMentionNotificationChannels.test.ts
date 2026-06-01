import { describe, expect, it, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { EchoAttentionChannelSummary } from '@shared/types';
import { bindChannelMessageBuckets } from '@/services/realtime/channelMessageAuthority';
import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import { MENTION_NOTIFICATION_STUB_PREVIEW } from './mentionNotificationAuthority';
import {
  mergeMentionNotificationPrefetchTargets,
  resolveMentionNotificationPrefetchTargets,
  resolveMentionNotificationPrefetchTargetsFromStubRows,
} from './prefetchMentionNotificationChannels';

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
  beforeEach(() => {
    bindChannelMessageBuckets(ref<Record<string, RawMessage[]>>({}));
  });

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

  it('prioritizes channels that still have loading stub rows', () => {
    const lowPriority = '00000000-0000-4000-8000-000000000020';
    const highPriority = '00000000-0000-4000-8000-000000000021';
    const targets = resolveMentionNotificationPrefetchTargets({
      channelAttentionByChannelId: {
        [lowPriority]: serverSummary({
          channelId: lowPriority,
          latestUnreadMessageId: 'msg-low',
          latestUnreadMessageAt: '2026-05-31T14:00:00.000Z',
        }),
        [highPriority]: serverSummary({
          channelId: highPriority,
          latestUnreadMessageId: 'msg-high',
          latestUnreadMessageAt: '2026-05-31T10:00:00.000Z',
        }),
      },
      readStateByChannelId: {},
      serverNotificationLevelByServerId: { 'server-1': 'mentions' },
      messagesByChannelId: {},
      prioritizeChannelIds: [highPriority],
      limit: 1,
    });

    expect(targets).toEqual([
      { channelId: highPriority, anchorMessageId: 'msg-high' },
    ]);
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

  it('builds prefetch targets from visible stub rows', () => {
    const channelId = '00000000-0000-4000-8000-000000000013';
    const targets = resolveMentionNotificationPrefetchTargetsFromStubRows([
      {
        channelId,
        messageId: 'msg-stub',
        preview: MENTION_NOTIFICATION_STUB_PREVIEW,
      },
    ]);

    expect(targets).toEqual([{ channelId, anchorMessageId: 'msg-stub' }]);
  });

  it('merges attention and stub targets without duplicate channels', () => {
    const attentionChannel = '00000000-0000-4000-8000-000000000014';
    const stubChannel = '00000000-0000-4000-8000-000000000015';
    const merged = mergeMentionNotificationPrefetchTargets(
      [{ channelId: attentionChannel, anchorMessageId: 'msg-a' }],
      [{ channelId: stubChannel, anchorMessageId: 'msg-b' }],
    );

    expect(merged).toEqual([
      { channelId: attentionChannel, anchorMessageId: 'msg-a' },
      { channelId: stubChannel, anchorMessageId: 'msg-b' },
    ]);
  });

  it('fills missing anchor from stub targets for the same channel', () => {
    const channelId = '00000000-0000-4000-8000-000000000016';
    const merged = mergeMentionNotificationPrefetchTargets(
      [{ channelId }],
      [{ channelId, anchorMessageId: 'msg-stub' }],
    );

    expect(merged).toEqual([{ channelId, anchorMessageId: 'msg-stub' }]);
  });
});
