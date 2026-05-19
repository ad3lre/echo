import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useAppLayoutEchoDmState } from '@/services/orchestration/useAppLayoutEchoDmState';

type EchoDmStateDeps = Parameters<typeof useAppLayoutEchoDmState>[0];

function createDeps() {
  return {
    serverStore: { selectServer: () => {} } as never,
    workspace: { users: ref([]), blockedUserIds: ref<string[]>([]) } as never,
    authSession: { backendUser: { id: 'self' } } as never,
    activeChannelId: ref('general'),
    activeRailTab: ref('dm'),
    dmActiveTab: ref('friends'),
    selectedDMUserId: ref<string | null>(null),
    groupDMs: ref({}),
  } as EchoDmStateDeps;
}

describe('useAppLayoutEchoDmState', () => {
  it('keeps lastActivityId monotonic for realtime updates', () => {
    const state = useAppLayoutEchoDmState(createDeps());
    state.mergeEchoDmThreadFromRealtime(
      {
        channelId: 'dm-1',
        kind: 'direct',
        peerUserId: 'u1',
      } as never,
      '200',
    );
    state.mergeEchoDmThreadFromRealtime(
      {
        channelId: 'dm-1',
        kind: 'direct',
        peerUserId: 'u1',
      } as never,
      '100',
    );
    expect(state.echoDmLastActivityIdByChannelId.value.get('dm-1')).toBe('200');
  });

  it('does not regress lastActivityId when older hydrate data arrives later', () => {
    const state = useAppLayoutEchoDmState(createDeps());
    state.mergeEchoDmThreadFromRealtime(
      {
        channelId: 'dm-2',
        kind: 'direct',
        peerUserId: 'u2',
      } as never,
      '300',
    );
    state.mergeEchoDmThreadsFromApi([
      {
        channelId: 'dm-2',
        kind: 'direct',
        peerUserId: 'u2',
        lastActivityId: '250',
      } as never,
    ]);
    expect(state.echoDmLastActivityIdByChannelId.value.get('dm-2')).toBe('300');
  });

  it('syncs blocked ids into workspace list on hydrate merge', () => {
    const deps = createDeps();
    const state = useAppLayoutEchoDmState(deps);
    state.mergeEchoBlockedFromApi([' u1 ', 'u2']);
    expect([...state.echoBlockedUserIds.value]).toEqual(['u1', 'u2']);
    expect(deps.workspace.blockedUserIds.value).toEqual(['u1', 'u2']);
  });

  it('drops server-backed DM threads missing from API snapshot (e.g. left group)', () => {
    const deps = createDeps();
    const state = useAppLayoutEchoDmState(deps);
    const gone = '123456789012345';
    const kept = '123456789012346';
    state.mergeEchoDmThreadsFromApi([
      {
        channelId: gone,
        kind: 'group',
        name: 'Old',
        memberUserIds: ['self', 'u1'],
      } as never,
    ]);
    expect(state.echoDmThreadIds.value.has(gone)).toBe(true);
    expect(deps.groupDMs.value[gone]?.name).toBe('Old');

    state.mergeEchoDmThreadsFromApi([
      {
        channelId: kept,
        kind: 'direct',
        peerUserId: 'u2',
      } as never,
    ]);
    expect(state.echoDmThreadIds.value.has(gone)).toBe(false);
    expect(deps.groupDMs.value[gone]).toBeUndefined();
    expect(state.echoDmThreadIds.value.has(kept)).toBe(true);
  });

  it('empty API thread list clears server-backed DM threads only', () => {
    const deps = createDeps();
    const state = useAppLayoutEchoDmState(deps);
    const gid = '123456789012345';
    state.mergeEchoDmThreadsFromApi([
      {
        channelId: gid,
        kind: 'group',
        name: 'G',
        memberUserIds: ['self'],
      } as never,
    ]);
    state.mergeEchoDmThreadsFromApi([]);
    expect(state.echoDmThreadIds.value.has(gid)).toBe(false);
  });
});
