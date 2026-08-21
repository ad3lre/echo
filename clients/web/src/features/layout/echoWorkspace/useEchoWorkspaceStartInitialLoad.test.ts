import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AuthClientApi from '@/api/authClient';
import type * as EchoClientApi from '@/api/echoClient';

vi.mock('@/api/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthClientApi>();
  return { ...actual, authContinueAsGuest: vi.fn() };
});

vi.mock('@/api/echoClient', async (importOriginal) => {
  const actual = await importOriginal<typeof EchoClientApi>();
  return { ...actual, fetchEchoWorkspaceState: vi.fn() };
});

vi.mock('@/features/layout/echoWorkspace/utils', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/features/layout/echoWorkspace/utils')
    >();
  return { ...actual, loadEchoExploreDirectoryRows: vi.fn(async () => []) };
});

vi.mock('@/features/layout/echoWorkspace/echoWorkspaceChannelPrefetch', () => ({
  prefetchWorkspaceBootstrapTextChannelsNonBlocking: vi.fn(),
}));

import { authContinueAsGuest, type AuthUserPublic } from '@/api/authClient';
import { fetchEchoWorkspaceState } from '@/api/echoClient';
import { createWorkspaceState } from '@/features/layout/echoWorkspace/useEchoWorkspace';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { useEchoSessionStore } from '@/features/layout/echoSession';

const cachedUser: AuthUserPublic = {
  id: 'u-registered',
  username: 'registered',
  displayName: 'Registered User',
  pfp: '',
  status: 'online',
  createdAt: new Date(0).toISOString(),
};

const emptyWorkspaceState = {
  servers: [],
  categoriesByServer: {},
  serverMemberIds: {},
  workspaceVersion: '1',
  upcomingEventsByServerId: {},
  myEventRsvps: [],
} as unknown as Awaited<ReturnType<typeof fetchEchoWorkspaceState>>;

describe('startInitialLoad restore-null semantics', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(fetchEchoWorkspaceState).mockResolvedValue(emptyWorkspaceState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(authContinueAsGuest).mockReset();
    vi.mocked(fetchEchoWorkspaceState).mockReset();
  });

  it('keeps the authenticated cached identity when restore returns null (no auto-guest, no reset)', async () => {
    const auth = useAuthSessionStore();
    auth.setSession({ user: cachedUser, planLimits: null });
    /* Transient `/auth/me` failure: restore resolves null but does NOT clear
     * tokens, so the store still holds the registered identity. */
    vi.spyOn(auth, 'restoreSessionFromApi').mockResolvedValue(null);

    const echoSession = useEchoSessionStore();
    const resetSessionState = vi.spyOn(echoSession, 'resetSessionState');

    const workspace = createWorkspaceState();
    await workspace.startInitialLoad();

    expect(authContinueAsGuest).not.toHaveBeenCalled();
    expect(resetSessionState).not.toHaveBeenCalled();
    expect(fetchEchoWorkspaceState).toHaveBeenCalledWith(
      expect.any(String),
      cachedUser.id,
      expect.anything(),
    );
    expect(auth.backendUser?.id).toBe(cachedUser.id);
    expect(workspace.fromApi.value).toBe(true);
  });

  it('does not apply a stale workspace fetch when auth rotates mid-flight', async () => {
    const auth = useAuthSessionStore();
    auth.setSession({ user: cachedUser, planLimits: null });
    vi.spyOn(auth, 'restoreSessionFromApi').mockResolvedValue(cachedUser);

    /* Simulate a login/upgrade landing while the workspace fetch is in flight. */
    vi.mocked(fetchEchoWorkspaceState).mockImplementation(async () => {
      auth.setSession({
        user: { ...cachedUser, id: 'u-new' },
        planLimits: null,
      });
      return emptyWorkspaceState;
    });

    const echoSession = useEchoSessionStore();
    const applyWorkspaceSnapshot = vi.spyOn(
      echoSession,
      'applyWorkspaceSnapshot',
    );

    const workspace = createWorkspaceState();
    await workspace.startInitialLoad();

    expect(
      applyWorkspaceSnapshot.mock.calls.filter(
        ([, opts]) => opts?.authoritative === true,
      ),
    ).toHaveLength(0);
  });

  it('does not skip post-login workspace hydrate when initial load is no longer in flight', async () => {
    const auth = useAuthSessionStore();
    auth.setSession({ user: cachedUser, planLimits: null });
    vi.spyOn(auth, 'restoreSessionFromApi').mockResolvedValue(cachedUser);

    const workspace = createWorkspaceState();
    await workspace.startInitialLoad();

    let skipConsumed = false;
    const consumeSkip = workspace.consumeSkipEchoWorkspaceHydrate;
    workspace.consumeSkipEchoWorkspaceHydrate = () => {
      skipConsumed = consumeSkip.call(workspace);
      return skipConsumed;
    };

    await workspace.startInitialLoad();

    expect(skipConsumed).toBe(false);
  });
});
