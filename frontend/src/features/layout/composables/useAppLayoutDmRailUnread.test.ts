import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useAppLayoutDmRailUnread } from '@/services/orchestration/useAppLayoutDmRailUnread';

describe('useAppLayoutDmRailUnread', () => {
  it('builds the unread DM avatar cluster from server attention', () => {
    const { dmIncomingRailCluster } = useAppLayoutDmRailUnread({
      authSession: {
        isAuthenticated: true,
        backendUser: { id: 'self' },
      } as never,
      workspace: {
        users: ref([
          { id: 'u1', name: 'Alice', pfp: 'a.png', status: 'online' },
          { id: 'u2', name: 'Bob', pfp: 'b.png', status: 'online' },
        ]),
      } as never,
      activeChannelId: ref('chan-active'),
      activeDmPeerUserId: ref(null),
      dmAttentionByChannelId: ref({
        chan1: {
          channelId: 'chan1',
          peerUserId: 'u1',
          unread: true,
          lastMessageAt: '2024-01-02T00:00:00.000Z',
        },
        chan2: {
          channelId: 'chan2',
          peerUserId: 'u2',
          unread: true,
          lastMessageAt: '2024-01-03T00:00:00.000Z',
        },
        'chan-active': {
          channelId: 'chan-active',
          peerUserId: 'u3',
          unread: true,
          lastMessageAt: '2024-01-04T00:00:00.000Z',
        },
      }),
    });

    expect(dmIncomingRailCluster.value).toEqual({
      avatars: [
        {
          kind: 'user',
          userId: 'u2',
          name: 'Bob',
          pfp: 'b.png',
          unreadCount: 1,
        },
        {
          kind: 'user',
          userId: 'u1',
          name: 'Alice',
          pfp: 'a.png',
          unreadCount: 1,
        },
      ],
      overflowCount: 0,
      totalUnreadCount: 2,
    });
  });

  it('includes group DM threads with unread badges in the rail cluster', () => {
    const gid = 'gdm-11111111-1111-4111-8111-111111111111';
    const { dmIncomingRailCluster } = useAppLayoutDmRailUnread({
      authSession: {
        isAuthenticated: true,
        backendUser: { id: 'self' },
      } as never,
      workspace: {
        users: ref([
          { id: 'u1', name: 'Alice', pfp: 'a.png', status: 'online' },
        ]),
      } as never,
      activeChannelId: ref('other-channel'),
      activeDmPeerUserId: ref(null),
      groupDMs: ref({
        [gid]: { name: 'Project Alpha', pfp: 'g.png' },
      }),
      dmAttentionByChannelId: ref({
        [gid]: {
          channelId: gid,
          unread: true,
          unreadCount: 4,
          lastMessageAt: '2024-01-10T00:00:00.000Z',
        },
        chan1: {
          channelId: 'chan1',
          peerUserId: 'u1',
          unread: true,
          unreadCount: 1,
          lastMessageAt: '2024-01-09T00:00:00.000Z',
        },
      }),
    });

    expect(dmIncomingRailCluster.value.totalUnreadCount).toBe(5);
    expect(dmIncomingRailCluster.value.avatars).toEqual([
      {
        kind: 'group',
        channelId: gid,
        name: 'Project Alpha',
        pfp: 'g.png',
        unreadCount: 4,
      },
      {
        kind: 'user',
        userId: 'u1',
        name: 'Alice',
        pfp: 'a.png',
        unreadCount: 1,
      },
    ]);
  });

  it('keeps pending incoming message requests off the unread counter', () => {
    const { dmIncomingRailCluster } = useAppLayoutDmRailUnread({
      authSession: {
        isAuthenticated: true,
        backendUser: { id: 'self' },
      } as never,
      workspace: {
        users: ref([
          { id: 'u3', name: 'Carol', pfp: 'c.png', status: 'online' },
          { id: 'u4', name: 'Drew', pfp: 'd.png', status: 'online' },
        ]),
        messageRequests: ref([
          { id: 'r1', channelId: 'mr-1', fromUserId: 'u3', preview: 'hey' },
          { id: 'r2', channelId: 'mr-2', fromUserId: 'u4', preview: 'yo' },
        ]),
      } as never,
      activeChannelId: ref('server-channel'),
      activeDmPeerUserId: ref(null),
      dmAttentionByChannelId: ref({}),
    });

    expect(dmIncomingRailCluster.value).toEqual({
      avatars: [
        {
          kind: 'user',
          userId: 'u3',
          name: 'Carol',
          pfp: 'c.png',
          unreadCount: 0,
        },
        {
          kind: 'user',
          userId: 'u4',
          name: 'Drew',
          pfp: 'd.png',
          unreadCount: 0,
        },
      ],
      overflowCount: 0,
      totalUnreadCount: 0,
    });
  });

  it('does not double-count same channel from attention and message request', () => {
    const { dmIncomingRailCluster } = useAppLayoutDmRailUnread({
      authSession: {
        isAuthenticated: true,
        backendUser: { id: 'self' },
      } as never,
      workspace: {
        users: ref([
          { id: 'u3', name: 'Carol', pfp: 'c.png', status: 'online' },
        ]),
        messageRequests: ref([
          { id: 'r1', channelId: 'chan-1', fromUserId: 'u3', preview: 'hey' },
        ]),
      } as never,
      activeChannelId: ref('server-channel'),
      activeDmPeerUserId: ref(null),
      dmAttentionByChannelId: ref({
        'chan-1': {
          channelId: 'chan-1',
          peerUserId: 'u3',
          unread: true,
          unreadCount: 1,
          lastMessageAt: '2024-01-05T00:00:00.000Z',
        },
      }),
    });

    expect(dmIncomingRailCluster.value).toEqual({
      avatars: [
        {
          kind: 'user',
          userId: 'u3',
          name: 'Carol',
          pfp: 'c.png',
          unreadCount: 1,
        },
      ],
      overflowCount: 0,
      totalUnreadCount: 1,
    });
  });

  it('hides unread entry for currently open DM peer even when channel ids differ', () => {
    const { dmIncomingRailCluster } = useAppLayoutDmRailUnread({
      authSession: {
        isAuthenticated: true,
        backendUser: { id: 'self' },
      } as never,
      workspace: {
        users: ref([{ id: 'u5', name: 'Eve', pfp: 'e.png', status: 'online' }]),
      } as never,
      activeChannelId: ref('server-channel'),
      activeDmPeerUserId: ref('u5'),
      dmAttentionByChannelId: ref({
        'dm-thread-5': {
          channelId: 'dm-thread-5',
          peerUserId: 'u5',
          unread: true,
          unreadCount: 3,
          lastMessageAt: '2024-01-05T00:00:00.000Z',
        },
      }),
    });

    expect(dmIncomingRailCluster.value).toEqual({
      avatars: [],
      overflowCount: 0,
      totalUnreadCount: 0,
    });
  });

  it('ignores attention rows that are not classified as DM channels', () => {
    const { dmIncomingRailCluster } = useAppLayoutDmRailUnread({
      authSession: {
        isAuthenticated: true,
        backendUser: { id: 'self' },
      } as never,
      workspace: {
        users: ref([
          { id: 'u7', name: 'Gwen', pfp: 'g.png', status: 'online' },
        ]),
      } as never,
      activeChannelId: ref('server-channel'),
      activeDmPeerUserId: ref(null),
      dmAttentionByChannelId: ref({
        'dm-thread-7': {
          channelId: 'dm-thread-7',
          peerUserId: 'u7',
          unread: true,
          unreadCount: 2,
          lastMessageAt: '2024-01-05T00:00:00.000Z',
        },
        'server-channel-99': {
          channelId: 'server-channel-99',
          peerUserId: 'u7',
          unread: true,
          unreadCount: 5,
          lastMessageAt: '2024-01-06T00:00:00.000Z',
        },
      }),
      isDmChannelId: (channelId) => channelId.startsWith('dm-'),
    });

    expect(dmIncomingRailCluster.value).toEqual({
      avatars: [
        {
          kind: 'user',
          userId: 'u7',
          name: 'Gwen',
          pfp: 'g.png',
          unreadCount: 2,
        },
      ],
      overflowCount: 0,
      totalUnreadCount: 2,
    });
  });

  it('pins active DM call peers on the rail even without unread', () => {
    const { dmIncomingRailCluster } = useAppLayoutDmRailUnread({
      authSession: {
        isAuthenticated: true,
        backendUser: { id: 'self' },
      } as never,
      workspace: {
        users: ref([
          { id: 'u9', name: 'Nora', pfp: 'n.png', status: 'online' },
        ]),
      } as never,
      activeChannelId: ref('server-channel'),
      activeDmPeerUserId: ref(null),
      dmAttentionByChannelId: ref({}),
      activeCallUserIds: ref(new Set(['u9'])),
    });

    expect(dmIncomingRailCluster.value).toEqual({
      avatars: [
        {
          kind: 'user',
          userId: 'u9',
          name: 'Nora',
          pfp: 'n.png',
          unreadCount: 0,
          inCall: true,
        },
      ],
      overflowCount: 0,
      totalUnreadCount: 0,
    });
  });

  it('does not treat a group thread id in activeCallUserIds as a 1:1 user row', () => {
    const gid = 'gdm-22222222-2222-4222-8222-222222222222';
    const { dmIncomingRailCluster } = useAppLayoutDmRailUnread({
      authSession: {
        isAuthenticated: true,
        backendUser: { id: 'self' },
      } as never,
      workspace: {
        users: ref([]),
      } as never,
      activeChannelId: ref('server-vc'),
      activeDmPeerUserId: ref(null),
      dmAttentionByChannelId: ref({}),
      groupDMs: ref({
        [gid]: { name: 'Design', pfp: 'dg.png' },
      }),
      activeCallUserIds: ref(new Set([gid])),
      activeCallGroupIds: ref(new Set([gid])),
    });

    expect(dmIncomingRailCluster.value.avatars).toEqual([
      {
        kind: 'group',
        channelId: gid,
        name: 'Design',
        pfp: 'dg.png',
        unreadCount: 0,
        inCall: true,
      },
    ]);
  });

  it('prefers real last-message timestamps over stale activity ids for rail ordering', () => {
    const { dmIncomingRailCluster } = useAppLayoutDmRailUnread({
      authSession: {
        isAuthenticated: true,
        backendUser: { id: 'self' },
      } as never,
      workspace: {
        users: ref([
          { id: 'u1', name: 'Alice', pfp: 'a.png', status: 'online' },
          { id: 'u2', name: 'Bob', pfp: 'b.png', status: 'online' },
        ]),
      } as never,
      activeChannelId: ref('server-channel'),
      activeDmPeerUserId: ref(null),
      activityIdByChannelId: ref(
        new Map<string, string>([
          ['chan1', '3000'],
          ['chan2', '1000'],
        ]),
      ),
      dmAttentionByChannelId: ref({
        chan1: {
          channelId: 'chan1',
          peerUserId: 'u1',
          unread: true,
          unreadCount: 1,
          lastMessageAt: '2024-01-01T00:00:00.000Z',
        },
        chan2: {
          channelId: 'chan2',
          peerUserId: 'u2',
          unread: true,
          unreadCount: 1,
          lastMessageAt: '2025-01-01T00:00:00.000Z',
        },
      }),
    });

    expect(
      dmIncomingRailCluster.value.avatars.map((row) =>
        row.kind === 'user' ? row.userId : row.channelId,
      ),
    ).toEqual(['u2', 'u1']);
  });
});
