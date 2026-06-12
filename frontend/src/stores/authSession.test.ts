import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { AuthUserPublic } from '@/api/authClient';
import { AuthApiError } from '@/api/authClient';
import { useAuthSessionStore } from './authSession';

const mocks = vi.hoisted(() => ({
  authFetchMe: vi.fn(),
  authLogout: vi.fn(),
  authLogoutAllSessions: vi.fn(),
  echoAuthDebugLog: vi.fn(),
  invalidateAuthFetchMeCache: vi.fn(),
  mergeLocalProfileIntoUser: vi.fn((user: AuthUserPublic) => user),
  overwriteLocalProfileFromAuthUser: vi.fn(),
  clearWorkspaceSessionCache: vi.fn(),
  clearEchoWorkspaceCache: vi.fn(),
  markPriorRegistered: vi.fn(),
  setSkipAutoGuestAfterLogout: vi.fn(),
  clearSkipAutoGuestAfterLogout: vi.fn(),
  trackEchoEvent: vi.fn(),
  clearEchoCsrfMemoryToken: vi.fn(),
  reportPrimaryFlowFailure: vi.fn(),
}));

vi.mock('@/api/authClient', () => ({
  AuthApiError: class AuthApiError extends Error {
    status: number;
    body: { code?: string; message?: string; detail?: string };

    constructor(
      status: number,
      body: { code?: string; message?: string; detail?: string },
    ) {
      super(body.message ?? body.code ?? 'Request failed');
      this.name = 'AuthApiError';
      this.status = status;
      this.body = body;
    }
  },
  authFetchMe: mocks.authFetchMe,
  authLogout: mocks.authLogout,
  authLogoutAllSessions: mocks.authLogoutAllSessions,
  echoAuthDebugLog: mocks.echoAuthDebugLog,
  invalidateAuthFetchMeCache: mocks.invalidateAuthFetchMeCache,
}));

vi.mock('@/utils/localProfilePersistence', () => ({
  mergeLocalProfileIntoUser: mocks.mergeLocalProfileIntoUser,
  overwriteLocalProfileFromAuthUser: mocks.overwriteLocalProfileFromAuthUser,
}));

vi.mock('@/utils/workspaceSessionCache', () => ({
  clearWorkspaceSessionCache: mocks.clearWorkspaceSessionCache,
}));

vi.mock('@/utils/workspacePersistence', () => ({
  clearEchoWorkspaceCache: mocks.clearEchoWorkspaceCache,
}));

vi.mock('@/utils/priorRegistration', () => ({
  markPriorRegistered: mocks.markPriorRegistered,
}));

vi.mock('@/utils/autoGuestLogoutSuppress', () => ({
  setSkipAutoGuestAfterLogout: mocks.setSkipAutoGuestAfterLogout,
  clearSkipAutoGuestAfterLogout: mocks.clearSkipAutoGuestAfterLogout,
}));

vi.mock('@/utils/analytics', () => ({
  trackEchoEvent: mocks.trackEchoEvent,
}));

vi.mock('@/utils/echoCsrf', () => ({
  clearEchoCsrfMemoryToken: mocks.clearEchoCsrfMemoryToken,
}));

vi.mock('@/utils/primaryFlowFailure', () => ({
  reportPrimaryFlowFailure: mocks.reportPrimaryFlowFailure,
}));

vi.mock('@/services/orchestration/workspaceSocialRefreshSeq', () => ({
  invalidateInFlightEchoWorkspaceSocialRefresh: vi.fn(),
}));

function makeUser(id: string): AuthUserPublic {
  return {
    id,
    username: id,
    displayName: id,
    pfp: '',
    status: 'online',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useAuthSessionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.authFetchMe.mockReset();
    mocks.mergeLocalProfileIntoUser.mockImplementation(
      (user: AuthUserPublic) => user,
    );
  });

  it('restores a current cookie-backed session', async () => {
    const user = makeUser('user-current');
    const planLimits = { plan: 'free' };
    mocks.authFetchMe.mockResolvedValueOnce({ user, planLimits });

    const store = useAuthSessionStore();
    await expect(store.restoreSessionFromApi()).resolves.toEqual(user);

    expect(store.backendUser?.id).toBe(user.id);
    expect(store.planLimits).toEqual(planLimits);
  });

  it('ignores a stale restore that completes after logout', async () => {
    const user = makeUser('user-old');
    const pending = deferred<{
      user: AuthUserPublic;
      planLimits?: Record<string, unknown>;
    }>();
    mocks.authFetchMe.mockReturnValueOnce(pending.promise);

    const store = useAuthSessionStore();
    const restore = store.restoreSessionFromApi();

    store.clearLocalTokens();
    pending.resolve({ user, planLimits: { plan: 'black' } });

    await expect(restore).resolves.toBeNull();
    expect(store.backendUser).toBeNull();
    expect(store.planLimits).toBeNull();
    expect(mocks.overwriteLocalProfileFromAuthUser).not.toHaveBeenCalledWith(
      user,
    );
  });

  it('does not apply a restored profile after logout', () => {
    const user = makeUser('user-a');
    const store = useAuthSessionStore();

    store.setSession({ user, planLimits: null });
    store.clearLocalTokens();
    vi.clearAllMocks();

    expect(store.applyRestoredProfile(user)).toBe(false);
    expect(store.backendUser).toBeNull();
    expect(mocks.overwriteLocalProfileFromAuthUser).not.toHaveBeenCalled();
  });

  it('does not apply a restored profile over another identity', () => {
    const current = makeUser('user-current');
    const stale = makeUser('user-stale');
    const store = useAuthSessionStore();

    store.setSession({ user: current, planLimits: null });
    vi.clearAllMocks();

    expect(store.applyRestoredProfile(stale)).toBe(false);
    expect(store.backendUser?.id).toBe(current.id);
    expect(mocks.overwriteLocalProfileFromAuthUser).not.toHaveBeenCalled();
  });

  it('clears workspace session cache when auth state is cleared', () => {
    const store = useAuthSessionStore();

    store.clearLocalTokens();

    expect(mocks.clearWorkspaceSessionCache).toHaveBeenCalledTimes(1);
    expect(mocks.clearEchoWorkspaceCache).toHaveBeenCalledTimes(1);
  });

  it('ignores stale /auth/me 401 after register/login rotated auth generation', async () => {
    const pending = deferred<never>();
    mocks.authFetchMe.mockReturnValueOnce(pending.promise);

    const store = useAuthSessionStore();
    const restore = store.restoreSessionFromApi();

    store.setSession({ user: makeUser('registered'), planLimits: null });

    pending.reject(
      new AuthApiError(401, {
        code: 'UNAUTHORIZED',
        message: 'no',
      }),
    );

    await expect(restore).resolves.toBeNull();
    expect(store.backendUser?.id).toBe('registered');
  });
});
