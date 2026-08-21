import { describe, expect, it } from 'vitest';
import {
  mergeEchoDmThreadIntoRegistry,
  mergeEchoDmThreadSnapshotIntoRegistry,
  removeEchoDmThreadsForPeer,
  type EchoDmThreadRegistryState,
} from '@/features/dm/echoDmThreadRegistry';

function emptyState(): EchoDmThreadRegistryState {
  return {
    peerByChannelId: new Map(),
    threadIds: new Set(),
    lastActivityIdByChannelId: new Map(),
    lastActivityAtMsByChannelId: new Map(),
    activeCallParticipantUserIdsByChannelId: new Map(),
    groupDMs: {},
  };
}

describe('echoDmThreadRegistry', () => {
  it('keeps lastActivityId monotonic across realtime updates', () => {
    let state = emptyState();
    state = mergeEchoDmThreadIntoRegistry(
      state,
      {
        channelId: 'dm-1',
        kind: 'direct',
        peerUserId: 'u1',
      },
      { overrideLastActivityId: '200' },
    );
    state = mergeEchoDmThreadIntoRegistry(
      state,
      {
        channelId: 'dm-1',
        kind: 'direct',
        peerUserId: 'u1',
      },
      { overrideLastActivityId: '100' },
    );
    expect(state.lastActivityIdByChannelId.get('dm-1')).toBe('200');
  });

  it('does not regress activity when older hydrate data arrives later', () => {
    let state = emptyState();
    state = mergeEchoDmThreadIntoRegistry(
      state,
      {
        channelId: '123456789012345',
        kind: 'direct',
        peerUserId: 'u2',
        lastActivityAt: '2026-01-02T00:00:00.000Z',
      },
      { overrideLastActivityId: '300' },
    );
    state = mergeEchoDmThreadSnapshotIntoRegistry(state, [
      {
        channelId: '123456789012345',
        kind: 'direct',
        peerUserId: 'u2',
        lastActivityId: '250',
        lastActivityAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(state.lastActivityIdByChannelId.get('123456789012345')).toBe('300');
    expect(state.lastActivityAtMsByChannelId.get('123456789012345')).toBe(
      Date.parse('2026-01-02T00:00:00.000Z'),
    );
  });

  it('drops server-backed DM threads missing from API snapshots', () => {
    let state = emptyState();
    const gone = '123456789012345';
    const kept = '123456789012346';
    state = mergeEchoDmThreadSnapshotIntoRegistry(
      state,
      [
        {
          channelId: gone,
          kind: 'group',
          name: 'Old',
          memberUserIds: ['self', 'u1'],
        },
      ],
      { selfId: 'self' },
    );

    expect(state.threadIds.has(gone)).toBe(true);
    expect(state.groupDMs[gone]?.name).toBe('Old');

    state = mergeEchoDmThreadSnapshotIntoRegistry(state, [
      {
        channelId: kept,
        kind: 'direct',
        peerUserId: 'u2',
      },
    ]);

    expect(state.threadIds.has(gone)).toBe(false);
    expect(state.groupDMs[gone]).toBeUndefined();
    expect(state.threadIds.has(kept)).toBe(true);
  });

  it('keeps legacy non-graph DM ids when API snapshot is empty', () => {
    let state = mergeEchoDmThreadIntoRegistry(emptyState(), {
      channelId: 'dm-legacy',
      kind: 'direct',
      peerUserId: 'u1',
    });

    state = mergeEchoDmThreadSnapshotIntoRegistry(state, []);

    expect(state.threadIds.has('dm-legacy')).toBe(true);
    expect(state.peerByChannelId.get('dm-legacy')).toBe('u1');
  });

  it('resolves group pfp from persisted icon before roster fallback', () => {
    let state = mergeEchoDmThreadIntoRegistry(
      emptyState(),
      {
        channelId: 'g1',
        kind: 'group',
        name: 'Group',
        memberUserIds: ['self', 'u1'],
      },
      {
        selfId: 'self',
        users: [{ id: 'u1', pfp: 'peer.png' }],
      },
    );
    expect(state.groupDMs.g1?.pfp).toBe('peer.png');

    state = mergeEchoDmThreadIntoRegistry(state, {
      channelId: 'g1',
      kind: 'group',
      name: 'Group',
      memberUserIds: ['self', 'u1'],
      pfp: ' persisted.png ',
    });

    expect(state.groupDMs.g1?.pfp).toBe('persisted.png');
  });

  it('updates and clears active call participants from snapshots', () => {
    let state = mergeEchoDmThreadSnapshotIntoRegistry(emptyState(), [
      {
        channelId: '123456789012345',
        kind: 'direct',
        peerUserId: 'u1',
        activeCallParticipantUserIds: [' self ', 'u1'],
      },
    ]);
    expect(
      state.activeCallParticipantUserIdsByChannelId.get('123456789012345'),
    ).toEqual(['self', 'u1']);

    state = mergeEchoDmThreadSnapshotIntoRegistry(state, [
      {
        channelId: '123456789012345',
        kind: 'direct',
        peerUserId: 'u1',
        activeCallParticipantUserIds: [],
      },
    ]);
    expect(
      state.activeCallParticipantUserIdsByChannelId.has('123456789012345'),
    ).toBe(false);
  });

  it('removes all thread registry data for a peer', () => {
    let state = mergeEchoDmThreadIntoRegistry(emptyState(), {
      channelId: '123456789012345',
      kind: 'direct',
      peerUserId: 'u1',
      lastActivityId: '100',
      lastActivityAt: '2026-01-01T00:00:00.000Z',
      activeCallParticipantUserIds: ['u1'],
    });

    state = removeEchoDmThreadsForPeer(state, 'u1');

    expect(state.peerByChannelId.has('123456789012345')).toBe(false);
    expect(state.threadIds.has('123456789012345')).toBe(false);
    expect(state.lastActivityIdByChannelId.has('123456789012345')).toBe(false);
    expect(state.lastActivityAtMsByChannelId.has('123456789012345')).toBe(
      false,
    );
    expect(
      state.activeCallParticipantUserIdsByChannelId.has('123456789012345'),
    ).toBe(false);
  });
});
