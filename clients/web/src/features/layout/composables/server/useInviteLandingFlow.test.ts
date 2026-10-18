/** @vitest-environment happy-dom */
import { computed, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useInviteLandingFlow } from './useInviteLandingFlow';

vi.mock('@/api/echo/invitesAndDirectory', () => ({
  fetchEchoInvitePreview: vi.fn(async () => null),
  postEchoJoinWithInviteToken: vi.fn(),
}));

import { postEchoJoinWithInviteToken } from '@/api/echo/invitesAndDirectory';

describe('useInviteLandingFlow', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  function mountFlow(opts?: {
    pathname?: string;
    authenticated?: boolean;
    workspaceReady?: boolean;
  }) {
    if (opts?.pathname) {
      window.history.replaceState({}, '', opts.pathname);
    }
    const isAuthenticated = computed(() => opts?.authenticated ?? true);
    const workspaceReady = computed(() => opts?.workspaceReady ?? true);
    return useInviteLandingFlow({
      base: '/',
      isAuthenticated,
      workspaceReady,
      activeRailTab: ref('servers'),
      joinedServerIds: computed(() => ['1516515790805925888']),
      joinedServerSlugs: computed(() => [
        { id: '1516515790805925888', vanityCode: '16p' },
      ]),
      openServerSurface: vi.fn(),
      selectExploreTab: vi.fn(),
      refreshWorkspace: vi.fn(),
    });
  }

  it('does not treat /channels/{snowflake}/… as an invite', () => {
    sessionStorage.setItem('echo:pendingInvite', '1516515790805925888');
    const flow = mountFlow({
      pathname: '/channels/1516515790805925888/999',
      authenticated: true,
    });
    flow.initFromUrl();
    expect(sessionStorage.getItem('echo:pendingInvite')).toBeNull();
    expect(postEchoJoinWithInviteToken).not.toHaveBeenCalled();
  });

  it('still detects bare vanity short links', () => {
    const flow = mountFlow({
      pathname: '/cool-server',
      authenticated: false,
      workspaceReady: false,
    });
    flow.initFromUrl();
    expect(flow.inviteCode.value).toBe('cool-server');
    expect(sessionStorage.getItem('echo:pendingInvite')).toBe('cool-server');
  });
});
