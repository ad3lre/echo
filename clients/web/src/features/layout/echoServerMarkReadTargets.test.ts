import { describe, expect, it, vi } from 'vitest';
import {
  buildEchoServerMarkReadPlan,
  buildLatestMessageIdByChannelIdForServer,
  resolveEchoMarkReadTargetsForMissingChannels,
} from '@/features/layout/echoServerMarkReadTargets';

describe('buildEchoServerMarkReadPlan', () => {
  it('uses firstUnreadMessageId when latest is absent and there is a single unread', () => {
    const plan = buildEchoServerMarkReadPlan({
      serverId: 'srv',
      channelAttentionByChannelId: {
        c1: {
          channelId: 'c1',
          kind: 'server',
          serverId: 'srv',
          unreadCount: 1,
          lastReadMessageId: null,
          firstUnreadMessageId: '90',
        },
      },
      readStateByChannelId: {},
    });
    expect(plan.targets).toEqual([
      { channelId: 'c1', lastReadMessageId: '90' },
    ]);
    expect(plan.channelIdsMissingLatestUnread).toEqual([]);
  });

  it('uses local latest message id when attention omits unread anchors', () => {
    const plan = buildEchoServerMarkReadPlan({
      serverId: 'srv',
      channelAttentionByChannelId: {
        c1: {
          channelId: 'c1',
          kind: 'server',
          serverId: 'srv',
          unreadCount: 2,
          lastReadMessageId: null,
        },
      },
      readStateByChannelId: {},
      latestMessageIdByChannelId: { c1: '99' },
    });
    expect(plan.targets).toEqual([
      { channelId: 'c1', lastReadMessageId: '99' },
    ]);
    expect(plan.channelIdsMissingLatestUnread).toEqual([]);
  });

  it('still skips channels with multiple unreads and no latest/first/local target', () => {
    const plan = buildEchoServerMarkReadPlan({
      serverId: 'srv',
      channelAttentionByChannelId: {
        c1: {
          channelId: 'c1',
          kind: 'server',
          serverId: 'srv',
          unreadCount: 2,
          lastReadMessageId: null,
        },
      },
      readStateByChannelId: {},
    });
    expect(plan.targets).toEqual([]);
    expect(plan.channelIdsMissingLatestUnread).toEqual(['c1']);
  });

  it('ignoreLocalCursor keeps targets when local cursor already matches', () => {
    const plan = buildEchoServerMarkReadPlan({
      serverId: 'srv',
      channelAttentionByChannelId: {
        c1: {
          channelId: 'c1',
          kind: 'server',
          serverId: 'srv',
          unreadCount: 3,
          lastReadMessageId: '100',
          latestUnreadMessageId: '100',
        },
      },
      readStateByChannelId: { c1: '100' },
      ignoreLocalCursor: true,
    });
    expect(plan.targets).toEqual([
      { channelId: 'c1', lastReadMessageId: '100' },
    ]);
  });

  it('resolveEchoMarkReadTargetsForMissingChannels fetches latest message ids', async () => {
    const fetchLatestMessageId = vi
      .fn()
      .mockResolvedValueOnce('55')
      .mockRejectedValueOnce(new Error('nope'));
    const result = await resolveEchoMarkReadTargetsForMissingChannels({
      channelIds: ['c1', 'c2'],
      fetchLatestMessageId,
    });
    expect(result.targets).toEqual([
      { channelId: 'c1', lastReadMessageId: '55' },
    ]);
    expect(result.unresolvedChannelIds).toEqual(['c2']);
  });

  it('buildLatestMessageIdByChannelIdForServer reads workspace buckets for all server channels', () => {
    const map = buildLatestMessageIdByChannelIdForServer({
      serverId: 'srv',
      categoriesByServer: {
        srv: [{ channels: [{ id: 'c1' }, { id: 'c2' }] }],
      },
      messagesByChannelId: {
        c1: [{ id: '10' }],
        c2: [{ id: '20' }, { id: '21' }],
      },
    });
    expect(map).toEqual({ c1: '10', c2: '21' });
  });
});
