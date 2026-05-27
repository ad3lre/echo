import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useAppLayoutServerPingIndicators } from './useAppLayoutServerPingIndicators';

const emptyLabels = ref<Record<string, string>>({});

describe('useAppLayoutServerPingIndicators', () => {
  it('maps server-authoritative ping summaries into the rail model', () => {
    const { serverPingKindByServerId, serverPingBubbleByServerId } =
      useAppLayoutServerPingIndicators({
        serverAttentionByServerId: ref({
          s1: { unread: true, pingKind: 'role' },
          s2: { unread: true },
        }),
        channelAttentionByChannelId: ref({}),
        readStateByChannelId: ref({}),
        serverNotificationLevelByServerId: ref({}),
        channelDisplayNameByChannelId: emptyLabels,
      });

    expect(serverPingKindByServerId.value).toEqual({ s1: 'role' });
    expect(serverPingBubbleByServerId.value).toEqual({});
  });

  it('aggregates ping counts into strongest-tier bubble per server', () => {
    const { serverPingBubbleByServerId } = useAppLayoutServerPingIndicators({
      serverAttentionByServerId: ref({
        srv: { unread: true, pingKind: 'personal' },
      }),
      channelAttentionByChannelId: ref({
        c1: {
          channelId: 'c1',
          kind: 'server',
          serverId: 'srv',
          unreadCount: 7,
          lastReadMessageId: null,
          pingKind: 'role',
        },
        c2: {
          channelId: 'c2',
          kind: 'server',
          serverId: 'srv',
          unreadCount: 3,
          lastReadMessageId: null,
          pingKind: 'personal',
        },
      }),
      readStateByChannelId: ref({}),
      serverNotificationLevelByServerId: ref({ srv: 'mentions' }),
      channelDisplayNameByChannelId: emptyLabels,
    });

    expect(serverPingBubbleByServerId.value.srv).toEqual({
      kind: 'personal',
      count: 3,
    });
  });

  it('drops ping bubble counts when read cursor is past latest unread (mark as read)', () => {
    const { serverPingBubbleByServerId } = useAppLayoutServerPingIndicators({
      serverAttentionByServerId: ref({
        srv: { unread: true, pingKind: 'personal' },
      }),
      channelAttentionByChannelId: ref({
        c1: {
          channelId: 'c1',
          kind: 'server',
          serverId: 'srv',
          unreadCount: 2,
          lastReadMessageId: '100',
          latestUnreadMessageId: '100',
          pingKind: 'personal',
        },
      }),
      readStateByChannelId: ref({
        c1: '100',
      }),
      serverNotificationLevelByServerId: ref({ srv: 'mentions' }),
      channelDisplayNameByChannelId: emptyLabels,
    });

    expect(serverPingBubbleByServerId.value.srv).toBeUndefined();
  });

  it('lists one rail entry per channel with mention-tier unread', () => {
    const { serverPingChannelDotsByServerId } =
      useAppLayoutServerPingIndicators({
        serverAttentionByServerId: ref({
          srv: { unread: true, pingKind: 'personal' },
        }),
        channelAttentionByChannelId: ref({
          c1: {
            channelId: 'c1',
            kind: 'server',
            serverId: 'srv',
            unreadCount: 7,
            lastReadMessageId: null,
            pingKind: 'role',
          },
          c2: {
            channelId: 'c2',
            kind: 'server',
            serverId: 'srv',
            unreadCount: 3,
            lastReadMessageId: null,
            pingKind: 'personal',
          },
        }),
        readStateByChannelId: ref({}),
        serverNotificationLevelByServerId: ref({ srv: 'mentions' }),
        channelDisplayNameByChannelId: ref({
          c1: 'roles',
          c2: 'general',
        }),
      });

    expect(serverPingChannelDotsByServerId.value.srv?.dots).toEqual([
      {
        channelId: 'c1',
        kind: 'role',
        unreadCount: 7,
        label: 'roles',
      },
      {
        channelId: 'c2',
        kind: 'personal',
        unreadCount: 3,
        label: 'general',
      },
    ]);
    expect(serverPingChannelDotsByServerId.value.srv?.overflowCount).toBe(0);
  });

  it('exposes plain-unread activity on the rail and missed activity on channels', () => {
    const {
      serverUnreadActivityDotByServerId,
      channelMissedActivityByChannelId,
    } = useAppLayoutServerPingIndicators({
      serverAttentionByServerId: ref({}),
      channelAttentionByChannelId: ref({
        cPlain: {
          channelId: 'cPlain',
          kind: 'server',
          serverId: 'srv',
          unreadCount: 2,
          lastReadMessageId: null,
        },
        cPing: {
          channelId: 'cPing',
          kind: 'server',
          serverId: 'srv',
          unreadCount: 1,
          lastReadMessageId: null,
          pingKind: 'personal',
        },
      }),
      readStateByChannelId: ref({}),
      serverNotificationLevelByServerId: ref({ srv: 'mentions' }),
      channelDisplayNameByChannelId: emptyLabels,
    });

    expect(serverUnreadActivityDotByServerId.value).toEqual({ srv: true });
    expect(channelMissedActivityByChannelId.value).toEqual({
      cPlain: true,
      cPing: true,
    });
  });

  it('does not show plain activity dot when unreads are mention-only', () => {
    const { serverUnreadActivityDotByServerId } =
      useAppLayoutServerPingIndicators({
        serverAttentionByServerId: ref({}),
        channelAttentionByChannelId: ref({
          cPing: {
            channelId: 'cPing',
            kind: 'server',
            serverId: 'srv',
            unreadCount: 2,
            lastReadMessageId: null,
            pingKind: 'personal',
          },
        }),
        readStateByChannelId: ref({}),
        serverNotificationLevelByServerId: ref({ srv: 'mentions' }),
        channelDisplayNameByChannelId: emptyLabels,
      });

    expect(serverUnreadActivityDotByServerId.value).toEqual({});
  });

  it('clears plain activity dot when read cursor reaches firstUnread (missing latest, single unread)', () => {
    const { serverUnreadActivityDotByServerId } =
      useAppLayoutServerPingIndicators({
        serverAttentionByServerId: ref({}),
        channelAttentionByChannelId: ref({
          c1: {
            channelId: 'c1',
            kind: 'server',
            serverId: 'srv',
            unreadCount: 1,
            lastReadMessageId: null,
            firstUnreadMessageId: '1492135200000000002',
          },
        }),
        readStateByChannelId: ref({
          c1: '1492135200000000002',
        }),
        serverNotificationLevelByServerId: ref({ srv: 'mentions' }),
        channelDisplayNameByChannelId: emptyLabels,
      });

    expect(serverUnreadActivityDotByServerId.value).toEqual({});
  });

  it('clears plain activity dot when readState advances past latestUnreadMessageId', () => {
    const { serverUnreadActivityDotByServerId } =
      useAppLayoutServerPingIndicators({
        serverAttentionByServerId: ref({}),
        channelAttentionByChannelId: ref({
          cPlain: {
            channelId: 'cPlain',
            kind: 'server',
            serverId: 'srv',
            unreadCount: 3,
            lastReadMessageId: null,
            latestUnreadMessageId: '1492135200000000005',
            firstUnreadMessageId: '1492135200000000001',
          },
        }),
        readStateByChannelId: ref({
          cPlain: '1492135200000000005',
        }),
        serverNotificationLevelByServerId: ref({ srv: 'mentions' }),
        channelDisplayNameByChannelId: emptyLabels,
      });

    expect(serverUnreadActivityDotByServerId.value).toEqual({});
  });

  it('clears rail indicators when cursor matches lastRead but unread anchors are missing', () => {
    const markId = '1492135200000000099';
    const {
      serverPingBubbleByServerId,
      serverUnreadActivityDotByServerId,
      channelMissedActivityByChannelId,
    } = useAppLayoutServerPingIndicators({
      serverAttentionByServerId: ref({
        srv: { unread: true, pingKind: 'personal' },
      }),
      channelAttentionByChannelId: ref({
        c1: {
          channelId: 'c1',
          kind: 'server',
          serverId: 'srv',
          unreadCount: 3,
          lastReadMessageId: markId,
          pingKind: 'personal',
        },
      }),
      readStateByChannelId: ref({ c1: markId }),
      serverNotificationLevelByServerId: ref({ srv: 'mentions' }),
      channelDisplayNameByChannelId: emptyLabels,
    });

    expect(serverPingBubbleByServerId.value.srv).toBeUndefined();
    expect(serverUnreadActivityDotByServerId.value).toEqual({});
    expect(channelMissedActivityByChannelId.value).toEqual({});
  });
});
