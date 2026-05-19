import type { ComputedRef } from 'vue';
import type { MemberRole } from '@/utils/memberProfiles';
import { getHighestRoleForMember } from '@/utils/memberProfiles';
import { isEchoGraphId } from '@/utils/echoIds';

const UNHOISTED_ROLE: MemberRole = {
  id: '__echo_unhoisted__',
  name: 'Members',
  color: '#94a3b8',
  listSortKey: -1,
  isUnhoistedBucket: true,
};

export function createMemberListHighestRoleResolver(opts: {
  memberListResolveHighestRole: ComputedRef<
    ((uid: string) => MemberRole | undefined) | undefined
  >;
  selectedServerId: { readonly value: string | null | undefined };
}) {
  return function resolveMemberHighestRole(uid: string): MemberRole {
    const resolved = opts.memberListResolveHighestRole.value?.(uid);
    if (resolved) return resolved;
    const sid = opts.selectedServerId.value ?? 'echo';
    if (sid !== 'echo' && isEchoGraphId(sid)) return UNHOISTED_ROLE;
    return getHighestRoleForMember(sid, uid);
  };
}
