import { computed } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { createMemberListHighestRoleResolver } from './useMemberListHighestRoleResolver';
import type { MemberRole } from '@/features/member-profile/memberProfiles';

vi.mock('@/features/member-profile/memberProfiles', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/features/member-profile/memberProfiles')
    >();
  return {
    ...actual,
    getHighestRoleForMember: vi.fn(() => ({
      id: 'fallback',
      name: 'Fallback',
      color: '#000',
    })),
  };
});

import { getHighestRoleForMember } from '@/features/member-profile/memberProfiles';

describe('createMemberListHighestRoleResolver', () => {
  it('uses role UI resolver when present', () => {
    const fromUi: MemberRole = {
      id: 'ui',
      name: 'UI',
      color: '#fff',
    };
    const resolve = createMemberListHighestRoleResolver({
      memberListResolveHighestRole: computed(() => () => fromUi),
      selectedServerId: computed(() => 'echo'),
    });
    expect(resolve('u1')).toEqual(fromUi);
    expect(getHighestRoleForMember).not.toHaveBeenCalled();
  });

  it('returns unhoisted bucket for Echo graph server when UI has no resolver', () => {
    const echoGraphId = '11111111-1111-4111-8111-111111111111';
    const resolve = createMemberListHighestRoleResolver({
      memberListResolveHighestRole: computed(() => undefined),
      selectedServerId: computed(() => echoGraphId),
    });
    const r = resolve('u1');
    expect(r.id).toBe('__echo_unhoisted__');
    expect(getHighestRoleForMember).not.toHaveBeenCalled();
  });

  it('falls back to getHighestRoleForMember for non-graph server', () => {
    vi.mocked(getHighestRoleForMember).mockClear();
    const resolve = createMemberListHighestRoleResolver({
      memberListResolveHighestRole: computed(() => undefined),
      selectedServerId: computed(() => 'legacy'),
    });
    const r = resolve('u9');
    expect(getHighestRoleForMember).toHaveBeenCalledWith('legacy', 'u9');
    expect(r.id).toBe('fallback');
  });
});
