import { describe, expect, it } from 'vitest';
import {
  MEMBER_LIST_VIRTUALIZE_THRESHOLD,
  estimateMemberListVirtualRowSize,
  flattenMemberListVirtualRows,
} from './memberListVirtualRows';
import type { MemberRole } from '@/utils/memberProfiles';

const role = (id: string, name: string): MemberRole =>
  ({
    id,
    name,
    color: '#fff',
  }) as MemberRole;

describe('memberListVirtualRows', () => {
  it('flattens headers then members with stable keys', () => {
    const rows = flattenMemberListVirtualRows([
      {
        role: role('r1', 'Admin'),
        members: [
          { id: 'u1', name: 'Ada', pfp: '' },
          { id: 'u2', name: 'Bob', pfp: '' },
        ],
      },
      {
        role: role('r2', 'Member'),
        members: [{ id: 'u3', name: 'Cara', pfp: '' }],
      },
    ]);
    expect(rows.map((r) => r.key)).toEqual([
      'hdr:r1',
      'm:r1:u1',
      'm:r1:u2',
      'hdr:r2',
      'm:r2:u3',
    ]);
    expect(estimateMemberListVirtualRowSize(rows[0]!)).toBe(28);
    expect(estimateMemberListVirtualRowSize(rows[1]!)).toBe(48);
    expect(MEMBER_LIST_VIRTUALIZE_THRESHOLD).toBe(80);
  });
});
