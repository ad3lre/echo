import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reactive, ref } from 'vue';
import type * as EchoClientApi from '@/api/echoClient';
import { useEchoWorkspaceLifecycle } from './useEchoWorkspaceLifecycle';
import {
  fetchEchoWorkspaceState,
  fetchEchoFriends,
  fetchEchoFriendRequests,
  fetchEchoDmMessageRequests,
  fetchEchoDmThreads,
  fetchEchoBlockedUsers,
} from '@/api/echoClient';

vi.mock('@/stores/echoSession', () => ({
  useEchoSessionStore: () => ({
    applyWorkspaceSnapshot: vi.fn(() => true),
    resetSessionState: vi.fn(),
  }),
}));

vi.mock('@/api/echoClient', async (importOriginal) => {
  const actual = await importOriginal<typeof EchoClientApi>();
  return {
    ...actual,
    fetchEchoWorkspaceState: vi.fn(),
    fetchEchoFriends: vi.fn(),
    fetchEchoFriendRequests: vi.fn(),
    fetchEchoDmMessageRequests: vi.fn(),
    fetchEchoDmThreads: vi.fn(),
    fetchEchoBlockedUsers: vi.fn(),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

describe('useEchoWorkspaceLifecycle', () => {
  beforeEach(() => {
    vi.mocked(fetchEchoWorkspaceState).mockReset();
    vi.mocked(fetchEchoFriends).mockReset();
    vi.mocked(fetchEchoFriendRequests).mockReset();
    vi.mocked(fetchEchoDmMessageRequests).mockReset();
    vi.mocked(fetchEchoDmThreads).mockReset();
    vi.mocked(fetchEchoBlockedUsers).mockReset();
  });

  it('coalesces concurrent hydrate calls into one in-flight fetch', async () => {
    const wsDeferred = deferred<any>();
    vi.mocked(fetchEchoWorkspaceState).mockReturnValue(wsDeferred.promise);
    vi.mocked(fetchEchoFriends).mockResolvedValue({ friends: [] });
    vi.mocked(fetchEchoFriendRequests).mockResolvedValue({
      incoming: [],
      outgoing: [],
    });
    vi.mocked(fetchEchoDmMessageRequests).mockResolvedValue({ requests: [] });
    vi.mocked(fetchEchoDmThreads).mockResolvedValue({ threads: [] });
    vi.mocked(fetchEchoBlockedUsers).mockResolvedValue({ blockedUserIds: [] });

    const workspace = {
      users: ref([]),
      friendIds: ref([]),
      friendIdsByUserId: ref({}),
      friendRequestsIncoming: ref([]),
      friendRequestsOutgoing: ref([]),
      messageRequests: ref([]),
      socialGraphStatus: ref<'idle' | 'loading' | 'ready' | 'error'>('idle'),
      timeoutUntilByServerUser: ref({}),
      lastTimeoutWorkspaceVersion: ref('0'),
      lastTimeoutServerCount: ref(0),
      lastTimeoutMemberKeyCount: ref(0),
      servers: ref([]),
      categoriesByServer: ref({}),
      serverMemberNicknames: ref<Record<string, Record<string, string>>>({}),
      consumeSkipEchoWorkspaceHydrate: () => false,
    } as any;

    const serverStore = {
      selectedServerId: null,
      setServers: vi.fn(),
      selectServer: vi.fn(),
      pickPreferredGuildServerId: vi.fn(() => null),
    } as any;

    const authSession = reactive({
      accessToken: 'token',
      isAuthenticated: true,
      backendUser: { id: 'u1', isGuest: false },
      authStateGeneration: 0,
    });

    const lifecycle = useEchoWorkspaceLifecycle({
      serverStore,
      authSession: authSession as any,
      workspace,
      activeChannelId: ref('general'),
      activeRailTab: ref('explore'),
      isServerSettingsModalOpen: ref(false),
      refreshEchoRoleData: async () => undefined,
      getFirstTextChannelId: () => '',
      mergeEchoDmThreadsFromApi: () => undefined,
      mergeEchoBlockedFromApi: () => undefined,
    });

    await flushMicrotasks();
    expect(fetchEchoWorkspaceState).toHaveBeenCalledTimes(1);

    const p1 = lifecycle.hydrateEchoFromApi();
    const p2 = lifecycle.hydrateEchoFromApi();
    expect(fetchEchoWorkspaceState).toHaveBeenCalledTimes(1);

    wsDeferred.resolve({
      servers: [],
      categoriesByServer: {},
      membersByServer: {},
      serverMemberIds: {},
      workspaceVersion: '1',
    });
    await p1;
    await p2;

    expect(fetchEchoWorkspaceState).toHaveBeenCalledTimes(1);
  });
});
