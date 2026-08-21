import type { MemberRole } from '@/features/member-profile/memberProfiles';

export type MemberListUser = {
  id: string;
  name: string;
  pfp: string;
  status?: string;
  customStatus?: string;
  isGuest?: boolean;
};

export type MemberListSection = {
  role: MemberRole;
  members: MemberListUser[];
};

export type MemberListVirtualHeader = {
  type: 'header';
  key: string;
  role: MemberRole;
  memberCount: number;
};

export type MemberListVirtualMember = {
  type: 'member';
  key: string;
  user: MemberListUser;
  role: MemberRole;
};

export type MemberListVirtualRow =
  | MemberListVirtualHeader
  | MemberListVirtualMember;

/** Flatten role sections into a single virtualizer-friendly row list. */
export function flattenMemberListVirtualRows(
  sections: readonly MemberListSection[],
): MemberListVirtualRow[] {
  const rows: MemberListVirtualRow[] = [];
  for (const section of sections) {
    rows.push({
      type: 'header',
      key: `hdr:${section.role.id}`,
      role: section.role,
      memberCount: section.members.length,
    });
    for (const user of section.members) {
      rows.push({
        type: 'member',
        key: `m:${section.role.id}:${user.id}`,
        user,
        role: section.role,
      });
    }
  }
  return rows;
}

/** Estimate row height (px) for TanStack virtualizer. */
export function estimateMemberListVirtualRowSize(
  row: MemberListVirtualRow,
): number {
  return row.type === 'header' ? 28 : 48;
}

/** Enable virtualization once the flattened list is large enough to matter. */
export const MEMBER_LIST_VIRTUALIZE_THRESHOLD = 80;
