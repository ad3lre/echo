import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';
import type { DmPanelInboxEntry } from '@/features/dm/buildDmPanelUserList';
import {
  useDmInboxUsersForPanelComputed,
  useGroupDmPanelListComputed,
} from './useDmPanelListComputeds';

describe('useDmPanelListComputeds', () => {
  it('useDmInboxUsersForPanelComputed filters to user rows', () => {
    const entries = computed<DmPanelInboxEntry[]>(() => [
      { kind: 'user', id: 'u1', name: 'A', pfp: '', status: 'offline' },
      { kind: 'group', id: 'g1', name: 'G', pfp: '' },
    ]);
    const usersOnly = useDmInboxUsersForPanelComputed(entries);
    expect(usersOnly.value).toHaveLength(1);
    expect(usersOnly.value[0]?.kind).toBe('user');
  });

  it('useGroupDmPanelListComputed maps group map to rows', () => {
    const groupDMs = ref({
      g1: { id: 'g1', name: 'Team', pfp: 'x' },
    });
    const rows = useGroupDmPanelListComputed(groupDMs);
    expect(rows.value).toEqual([{ id: 'g1', name: 'Team', pfp: 'x' }]);
  });
});
