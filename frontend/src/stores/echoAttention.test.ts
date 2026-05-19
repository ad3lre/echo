import { describe, expect, it, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useEchoAttentionStore } from './echoAttention';

describe('useEchoAttentionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('hydrates read state and derived DM attention from channel attention', () => {
    const store = useEchoAttentionStore();
    const channelId = '1492135186257805312';
    const lastMessageId = '1492135200000000000';

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        [channelId]: {
          channelId,
          kind: 'dm',
          lastReadMessageId: null,
          unreadCount: 4,
          firstUnreadMessageId: '1492135199999999997',
          latestUnreadMessageId: lastMessageId,
          latestUnreadMessageAt: '2026-04-10T12:00:00.000Z',
        },
      },
      serverAttentionByServerId: {},
      serverNotificationLevelByServerId: {},
    });

    expect(store.readStateByChannelId[channelId]).toBeNull();
    expect(store.dmAttentionByChannelId[channelId]?.unreadCount).toBe(4);
    expect(store.dmAttentionByChannelId[channelId]?.lastMessageId).toBe(
      lastMessageId,
    );
  });

  it('keeps DM attention when cursor reaches first-unread but not latest-unread', () => {
    const store = useEchoAttentionStore();
    const channelId = '1492135186257805312';

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        [channelId]: {
          channelId,
          kind: 'dm',
          lastReadMessageId: null,
          unreadCount: 2,
          firstUnreadMessageId: '1492135200000000001',
          latestUnreadMessageId: '1492135200000000002',
        },
      },
      serverAttentionByServerId: {},
      serverNotificationLevelByServerId: {},
    });

    // Cursor only at the first unread — latest is still ahead.
    store.patchReadState(channelId, '1492135200000000001');

    expect(store.readStateByChannelId[channelId]).toBe('1492135200000000001');
    expect(store.dmAttentionByChannelId[channelId]?.unread).toBe(true);
    expect(store.dmAttentionByChannelId[channelId]?.unreadCount).toBe(2);
  });

  it('clears DM attention immediately when cursor reaches latest unread id', () => {
    const store = useEchoAttentionStore();
    const channelId = '1492135186257805312';
    const latestUnreadMessageId = '1492135200000000002';

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        [channelId]: {
          channelId,
          kind: 'dm',
          lastReadMessageId: null,
          unreadCount: 2,
          firstUnreadMessageId: '1492135200000000001',
          latestUnreadMessageId,
        },
      },
      serverAttentionByServerId: {},
      serverNotificationLevelByServerId: {},
    });

    store.patchReadState(channelId, latestUnreadMessageId);

    expect(store.readStateByChannelId[channelId]).toBe(latestUnreadMessageId);
    // DM should be gone from dmAttentionByChannelId and desktopAttentionScore
    // as soon as the cursor reaches the latest unread — no snapshot round-trip needed.
    expect(store.dmAttentionByChannelId[channelId]).toBeUndefined();
    expect(store.desktopAttentionScore).toBe(0);
  });

  it('clears server rail unread when local cursor reaches latest unread id', () => {
    const store = useEchoAttentionStore();
    const channelId = '1492135186257805312';
    const serverId = 'srv-ghost';
    const latestUnreadMessageId = '1492135200000000002';

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        [channelId]: {
          channelId,
          kind: 'server',
          serverId,
          lastReadMessageId: null,
          unreadCount: 2,
          latestUnreadMessageId,
        },
      },
      serverAttentionByServerId: { [serverId]: { unread: true } },
      serverNotificationLevelByServerId: {},
    });

    store.patchReadState(channelId, latestUnreadMessageId);

    expect(store.readStateByChannelId[channelId]).toBe(latestUnreadMessageId);
    expect(store.serverAttentionByServerId[serverId]).toBeUndefined();
  });

  it('when client read cursor is ahead of incoming snapshot, keeps server unread counts from incoming', () => {
    const store = useEchoAttentionStore();
    const channelId = '1492135186257805312';

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        [channelId]: {
          channelId,
          kind: 'dm',
          lastReadMessageId: null,
          unreadCount: 2,
          firstUnreadMessageId: '1492135200000000001',
        },
      },
      serverAttentionByServerId: {},
      serverNotificationLevelByServerId: {},
    });

    store.patchReadState(channelId, '1492135200000000005');

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        [channelId]: {
          channelId,
          kind: 'dm',
          lastReadMessageId: '1492135200000000004',
          unreadCount: 0,
        },
      },
      serverAttentionByServerId: {},
      serverNotificationLevelByServerId: {},
    });

    expect(store.channelAttentionByChannelId[channelId]?.unreadCount).toBe(0);
    expect(store.readStateByChannelId[channelId]).toBe('1492135200000000005');
  });

  it('mergeReadStateUpdate applies read cursor and channel attention in one call', () => {
    const store = useEchoAttentionStore();
    const channelId = '1492135186257805312';
    const serverId = 'srv-1';

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        [channelId]: {
          channelId,
          kind: 'server',
          serverId,
          lastReadMessageId: null,
          unreadCount: 5,
          pingKind: 'personal',
        },
      },
      serverAttentionByServerId: {
        [serverId]: { unread: true, pingKind: 'personal' },
      },
      serverNotificationLevelByServerId: {},
    });

    store.mergeReadStateUpdate(channelId, '1492135200000000003', {
      channelId,
      kind: 'server',
      serverId,
      lastReadMessageId: '1492135200000000003',
      unreadCount: 0,
    });

    expect(store.readStateByChannelId[channelId]).toBe('1492135200000000003');
    expect(store.channelAttentionByChannelId[channelId]?.unreadCount).toBe(0);
    expect(store.serverAttentionByServerId[serverId]).toBeUndefined();
  });

  it('mergeReadStateUpdate preserves existing serverId when not in payload', () => {
    const store = useEchoAttentionStore();
    const channelId = 'ch-1';
    const serverId = 'srv-2';

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        [channelId]: {
          channelId,
          kind: 'server',
          serverId,
          lastReadMessageId: null,
          unreadCount: 3,
        },
      },
      serverAttentionByServerId: {
        [serverId]: { unread: true },
      },
      serverNotificationLevelByServerId: {},
    });

    store.mergeReadStateUpdate(channelId, '100', {
      channelId,
      kind: 'server',
      lastReadMessageId: '100',
      unreadCount: 1,
    });

    expect(store.channelAttentionByChannelId[channelId]?.serverId).toBe(
      serverId,
    );
    expect(store.channelAttentionByChannelId[channelId]?.unreadCount).toBe(1);
  });

  it('applyServerChannelMarkRead clears unread and server rail when anchors are missing', () => {
    const store = useEchoAttentionStore();
    const channelId = 'ch-voice';
    const serverId = 'srv-voice';

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        [channelId]: {
          channelId,
          kind: 'server',
          serverId,
          lastReadMessageId: null,
          unreadCount: 3,
          pingKind: 'personal',
        },
      },
      serverAttentionByServerId: {
        [serverId]: { unread: true, pingKind: 'personal' },
      },
      serverNotificationLevelByServerId: {},
    });

    store.applyServerChannelMarkRead(channelId, '1492135200000000010');

    expect(store.readStateByChannelId[channelId]).toBe('1492135200000000010');
    expect(store.channelAttentionByChannelId[channelId]?.unreadCount).toBe(0);
    expect(
      store.channelAttentionByChannelId[channelId]?.pingKind,
    ).toBeUndefined();
    expect(store.serverAttentionByServerId[serverId]).toBeUndefined();
  });

  it('applyServerChannelMarkRead clears DM attention when unread anchors are missing', () => {
    const store = useEchoAttentionStore();
    const channelId = 'dm-ch';

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        [channelId]: {
          channelId,
          kind: 'dm',
          lastReadMessageId: null,
          unreadCount: 2,
          pingKind: 'personal',
          peerUserId: 'u-1',
        },
      },
      serverAttentionByServerId: {},
      serverNotificationLevelByServerId: {},
    });

    store.applyServerChannelMarkRead(channelId, '1492135200000000099');

    expect(store.readStateByChannelId[channelId]).toBe('1492135200000000099');
    expect(store.channelAttentionByChannelId[channelId]?.kind).toBe('dm');
    expect(store.channelAttentionByChannelId[channelId]?.unreadCount).toBe(0);
    expect(store.dmAttentionByChannelId[channelId]).toBeUndefined();
  });

  it('replaceSnapshot zeros stale unread when local cursor is past unread boundary', () => {
    const store = useEchoAttentionStore();
    const channelId = 'ch-stale';
    const serverId = 'srv-stale';
    const latestUnreadMessageId = '1492135200000000005';

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        [channelId]: {
          channelId,
          kind: 'server',
          serverId,
          lastReadMessageId: null,
          unreadCount: 4,
          latestUnreadMessageId,
          pingKind: 'role',
        },
      },
      serverAttentionByServerId: {
        [serverId]: { unread: true, pingKind: 'role' },
      },
      serverNotificationLevelByServerId: {},
    });

    store.patchReadState(channelId, latestUnreadMessageId);

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        [channelId]: {
          channelId,
          kind: 'server',
          serverId,
          lastReadMessageId: '1492135200000000004',
          unreadCount: 4,
          latestUnreadMessageId,
          pingKind: 'role',
        },
      },
      serverAttentionByServerId: {
        [serverId]: { unread: true, pingKind: 'role' },
      },
      serverNotificationLevelByServerId: {},
    });

    expect(store.readStateByChannelId[channelId]).toBe(latestUnreadMessageId);
    expect(store.channelAttentionByChannelId[channelId]?.unreadCount).toBe(0);
    expect(store.serverAttentionByServerId[serverId]).toBeUndefined();
  });

  it('mergeReadStateUpdate without channelAttention only patches read cursor', () => {
    const store = useEchoAttentionStore();
    const channelId = 'ch-2';

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        [channelId]: {
          channelId,
          kind: 'server',
          serverId: 'srv-3',
          lastReadMessageId: null,
          unreadCount: 2,
        },
      },
      serverAttentionByServerId: { 'srv-3': { unread: true } },
      serverNotificationLevelByServerId: {},
    });

    store.mergeReadStateUpdate(channelId, '50');

    expect(store.readStateByChannelId[channelId]).toBe('50');
    expect(store.channelAttentionByChannelId[channelId]?.unreadCount).toBe(2);
  });
});
