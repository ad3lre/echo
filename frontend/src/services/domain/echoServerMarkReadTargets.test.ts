import { describe, expect, it } from 'vitest';
import {
  buildEchoServerMarkReadPlan,
  buildLatestMessageIdByChannelIdForServer,
} from './echoServerMarkReadTargets';

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
