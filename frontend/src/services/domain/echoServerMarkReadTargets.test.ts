import { describe, expect, it } from 'vitest';
import { buildEchoServerMarkReadPlan } from './echoServerMarkReadTargets';

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

  it('still skips channels with multiple unreads and no latest/first target', () => {
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
});
