import { describe, expect, it } from 'vitest';
import type { DmPanelInboxEntry } from '@/features/dm/buildDmPanelUserList';
import { filterDmPanelInboxUserEntries } from './filterDmPanelInboxUserEntries';

describe('filterDmPanelInboxUserEntries', () => {
  it('keeps only user rows', () => {
    const rows: DmPanelInboxEntry[] = [
      {
        kind: 'user',
        id: 'u1',
        name: 'A',
        pfp: '',
        status: 'online',
      },
      {
        kind: 'group',
        id: 'g1',
        name: 'G',
        pfp: '',
      },
    ];
    expect(filterDmPanelInboxUserEntries(rows)).toHaveLength(1);
    expect(filterDmPanelInboxUserEntries(rows)[0]?.kind).toBe('user');
  });
});
