import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';
import type { AuthUserPublic } from '@/api/authClient';
import type { EchoPlanLimitsPublic } from '@shared/echoPlanLimits';
import { useAppLayoutShellAuthDerived } from './useAppLayoutShellAuthDerived';

const baseUser = (): AuthUserPublic =>
  ({
    id: 'u1',
    displayName: 'Display',
    username: 'user1',
    pfp: 'p.png',
    status: 'online',
    isGuest: false,
  }) as AuthUserPublic;

describe('useAppLayoutShellAuthDerived', () => {
  it('derives currentUser and selfProfile from backend user and selected server', () => {
    const backendUser = ref<AuthUserPublic | null>(baseUser());
    const planLimits = ref(null);
    const selectedServer = ref({ id: 's1', name: 'Server' });

    const { currentUser, selfProfile } = useAppLayoutShellAuthDerived({
      backendUser,
      planLimits,
      selectedServer,
    });

    expect(currentUser.value?.id).toBe('u1');
    expect(selfProfile.value?.serverName).toBe('Server');

    selectedServer.value = { id: 's2', name: 'Other' };
    expect(selfProfile.value?.serverName).toBe('Other');

    backendUser.value = null;
    expect(currentUser.value).toBeUndefined();
    expect(selfProfile.value).toBeNull();
  });

  it('exposes socket/session computeds aligned with backend user', () => {
    const backendUser = ref<AuthUserPublic | null>(baseUser());
    const planLimits = ref(null);
    const selectedServer = ref(undefined);

    const out = useAppLayoutShellAuthDerived({
      backendUser,
      planLimits,
      selectedServer,
    });

    expect(out.isAuthenticatedComputed.value).toBe(true);
    expect(out.currentUserIdForSocket.value).toBe('u1');
    expect(out.currentUserComputed.value?.id).toBe('u1');

    backendUser.value = null;
    expect(out.isAuthenticatedComputed.value).toBe(false);
    expect(out.currentUserIdForSocket.value).toBeUndefined();
    expect(out.currentUserComputed.value).toBeUndefined();
  });

  it('isGuestComputed tracks backendUser.isGuest', () => {
    const backendUser = ref<AuthUserPublic | null>({
      ...baseUser(),
      isGuest: true,
    } as AuthUserPublic);
    const planLimits = ref(null);
    const selectedServer = ref(undefined);

    const { isGuestComputed } = useAppLayoutShellAuthDerived({
      backendUser,
      planLimits,
      selectedServer,
    });
    expect(isGuestComputed.value).toBe(true);

    backendUser.value = baseUser();
    expect(isGuestComputed.value).toBe(false);
  });

  it('normalizes groupDmMaxMembers via plan limits', () => {
    const backendUser = ref<AuthUserPublic | null>(baseUser());
    const planLimits = ref({ groupDmMaxMembers: 12 } as EchoPlanLimitsPublic);
    const selectedServer = ref<{ id: string; name: string } | undefined>(
      undefined,
    );

    const { groupDmMaxMembers } = useAppLayoutShellAuthDerived({
      backendUser,
      planLimits,
      selectedServer,
    });

    expect(groupDmMaxMembers.value).toBe(12);
  });

  it('accepts computed selected server', () => {
    const backendUser = ref<AuthUserPublic | null>(baseUser());
    const planLimits = ref(null);
    const selectedServer = computed(() => ({ id: 'c', name: 'From computed' }));

    const { selfProfile } = useAppLayoutShellAuthDerived({
      backendUser,
      planLimits,
      selectedServer,
    });

    expect(selfProfile.value?.serverName).toBe('From computed');
  });

  it('uses workspace member joinedAt for self profile when roster includes it', () => {
    const backendUser = ref<AuthUserPublic | null>(baseUser());
    const planLimits = ref(null);
    const selectedServer = ref({ id: 's1', name: 'Server' });
    const workspaceMembersByServer = ref({
      s1: [
        {
          userId: 'u1',
          name: 'Display',
          pfp: 'p.png',
          joinedAt: '2024-06-15T12:00:00.000Z',
        },
      ],
    });

    const { selfProfile } = useAppLayoutShellAuthDerived({
      backendUser,
      planLimits,
      selectedServer,
      workspaceMembersByServer,
    });

    expect(selfProfile.value?.joinedAt).toMatch(/Jun/);
    expect(selfProfile.value?.joinedAt).toMatch(/2024/);
  });
});
