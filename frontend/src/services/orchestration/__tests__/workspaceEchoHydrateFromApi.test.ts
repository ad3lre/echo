import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type * as EchoClientApi from '@/api/echoClient';
import type { RailTab } from '@/features/layout/mainSurface';
import type { MessageRequestEntry } from '@/composables/workspace/types';
import type * as SocialApi from '@/services/orchestration/workspaceSocialHydrate';

vi.mock('@/api/echoClient', async (importOriginal) => {
  const actual = await importOriginal<typeof EchoClientApi>();
  return {
    ...actual,
    fetchEchoWorkspaceState: vi.fn(),
  };
});

vi.mock(
  '@/services/orchestration/workspaceSocialHydrate',
  async (importOriginal) => {
    const actual = await importOriginal<typeof SocialApi>();
    return {
      ...actual,
      fetchWorkspaceSocialForHydrate: vi.fn(),
      fetchWorkspaceSocialForRefresh: vi.fn(),
    };
  },
);

vi.mock('@/utils/workspacePersistence', () => ({
  saveEchoWorkspaceToCache: vi.fn(),
  loadEchoWorkspaceFromCache: vi.fn(() => null),
}));

import { fetchEchoWorkspaceState } from '@/api/echoClient';
import {
  fetchWorkspaceSocialForHydrate,
  fetchWorkspaceSocialForRefresh,
} from '@/services/orchestration/workspaceSocialHydrate';
import { saveEchoWorkspaceToCache } from '@/utils/workspacePersistence';
import {
  runEchoWorkspaceHydrateFromApi,
  runEchoWorkspaceSocialRefreshFromApi,
} from '../workspaceEchoHydrateFromApi';

const emptySocial: SocialApi.WorkspaceSocialSnapshot = {
  friendIds: [],
  friendRequestsIncoming: [],
  friendRequestsOutgoing: [],
  messageRequests: [],
  dmThreads: [],
  blockedUserIds: [],
};

describe('runEchoWorkspaceHydrateFromApi', () => {
  beforeEach(() => {
    vi.mocked(fetchEchoWorkspaceState).mockReset();
    vi.mocked(fetchWorkspaceSocialForHydrate).mockReset();
    vi.mocked(fetchWorkspaceSocialForRefresh).mockReset();
    vi.mocked(saveEchoWorkspaceToCache).mockReset();
  });

  it('skips workspace fetch when consumeSkip returns true but still loads social', async () => {
    vi.mocked(fetchWorkspaceSocialForHydrate).mockResolvedValue({
      ...emptySocial,
      friendIds: ['u1'],
    });

    const friendIds = ref<string[]>([]);
    const result = await runEchoWorkspaceHydrateFromApi({
      token: 't',
      userId: 'me',
      isGuest: false,
      workspace: {
        consumeSkipEchoWorkspaceHydrate: () => true,
        users: ref([]),
        serverMemberNicknames: ref({}),
        timeoutUntilByServerUser: ref({}),
        lastTimeoutWorkspaceVersion: ref('0'),
        lastTimeoutServerCount: ref(0),
        lastTimeoutMemberKeyCount: ref(0),
        friendIds,
        friendRequestsIncoming: ref([]),
        friendRequestsOutgoing: ref([]),
        messageRequests: ref([]),
        socialGraphStatus: ref<'idle' | 'loading' | 'ready' | 'error'>('idle'),
      },
      echoSession: { applyWorkspaceSnapshot: vi.fn(() => true) },
      serverStore: {
        selectedServerId: null,
        setServers: vi.fn(),
        selectServer: vi.fn(),
        pickPreferredGuildServerId: vi.fn(() => null),
      },
      activeChannelId: ref(''),
      activeRailTab: ref<RailTab>('explore'),
      getFirstTextChannelId: () => '',
      refreshEchoRoleData: vi.fn(() => Promise.resolve()),
      ensureAuthUserInMockUsers: vi.fn(),
    });

    expect(result).toEqual({ ok: true });
    expect(fetchEchoWorkspaceState).not.toHaveBeenCalled();
    expect(fetchWorkspaceSocialForHydrate).toHaveBeenCalledWith('t', false);
    expect(friendIds.value).toEqual(['u1']);
  });

  it('does not update server store or cache when applyWorkspaceSnapshot rejects stale snapshot', async () => {
    vi.mocked(fetchEchoWorkspaceState).mockResolvedValue({
      servers: [{ id: 's1', name: 'Guild', imageUrl: '', ownerId: 'o1' }],
      categoriesByServer: {},
      serverMemberIds: {},
      workspaceVersion: '10',
      upcomingEventsByServerId: {},
      myEventRsvps: [],
    } as Awaited<ReturnType<typeof fetchEchoWorkspaceState>>);
    vi.mocked(fetchWorkspaceSocialForHydrate).mockResolvedValue(emptySocial);

    const setServers = vi.fn();
    const applyWorkspaceSnapshot = vi.fn(() => false);

    const result = await runEchoWorkspaceHydrateFromApi({
      token: 't',
      userId: 'me',
      isGuest: false,
      workspace: {
        consumeSkipEchoWorkspaceHydrate: () => false,
        users: ref([]),
        serverMemberNicknames: ref({}),
        timeoutUntilByServerUser: ref({}),
        lastTimeoutWorkspaceVersion: ref('0'),
        lastTimeoutServerCount: ref(0),
        lastTimeoutMemberKeyCount: ref(0),
        friendIds: ref([]),
        friendRequestsIncoming: ref([]),
        friendRequestsOutgoing: ref([]),
        messageRequests: ref([]),
        socialGraphStatus: ref<'idle' | 'loading' | 'ready' | 'error'>('idle'),
      },
      echoSession: { applyWorkspaceSnapshot },
      serverStore: {
        selectedServerId: null,
        setServers,
        selectServer: vi.fn(),
        pickPreferredGuildServerId: vi.fn(() => null),
      },
      activeChannelId: ref(''),
      activeRailTab: ref<RailTab>('explore'),
      getFirstTextChannelId: () => '',
      refreshEchoRoleData: vi.fn(() => Promise.resolve()),
      ensureAuthUserInMockUsers: vi.fn(),
    });

    expect(result).toEqual({ ok: true });
    expect(applyWorkspaceSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceVersion: '10' }),
      { authoritative: true },
    );
    expect(setServers).not.toHaveBeenCalled();
    expect(saveEchoWorkspaceToCache).not.toHaveBeenCalled();
  });

  it('returns ok:false when workspace fetch throws', async () => {
    vi.mocked(fetchEchoWorkspaceState).mockRejectedValue(new Error('network'));
    vi.mocked(fetchWorkspaceSocialForHydrate).mockResolvedValue(emptySocial);

    const result = await runEchoWorkspaceHydrateFromApi({
      token: 't',
      userId: 'me',
      isGuest: false,
      workspace: {
        consumeSkipEchoWorkspaceHydrate: () => false,
        users: ref([]),
        serverMemberNicknames: ref({}),
        timeoutUntilByServerUser: ref({}),
        lastTimeoutWorkspaceVersion: ref('0'),
        lastTimeoutServerCount: ref(0),
        lastTimeoutMemberKeyCount: ref(0),
        friendIds: ref([]),
        friendRequestsIncoming: ref([]),
        friendRequestsOutgoing: ref([]),
        messageRequests: ref([]),
        socialGraphStatus: ref<'idle' | 'loading' | 'ready' | 'error'>('idle'),
      },
      echoSession: { applyWorkspaceSnapshot: vi.fn(() => true) },
      serverStore: {
        selectedServerId: null,
        setServers: vi.fn(),
        selectServer: vi.fn(),
        pickPreferredGuildServerId: vi.fn(() => null),
      },
      activeChannelId: ref(''),
      activeRailTab: ref<RailTab>('explore'),
      getFirstTextChannelId: () => '',
      refreshEchoRoleData: vi.fn(() => Promise.resolve()),
      ensureAuthUserInMockUsers: vi.fn(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.userMessage).toBe('network');
    }
    expect(fetchWorkspaceSocialForHydrate).not.toHaveBeenCalled();
  });

  it('does not apply stale hydrate social snapshot after a newer social refresh (unfriend race)', async () => {
    const staleSocial: SocialApi.WorkspaceSocialSnapshot = {
      friendIds: ['stale-peer'],
      friendRequestsIncoming: [],
      friendRequestsOutgoing: [],
      messageRequests: [],
      dmThreads: [],
      blockedUserIds: [],
    };

    let slowResolve!: (v: SocialApi.WorkspaceSocialSnapshot) => void;
    const slowPromise = new Promise<SocialApi.WorkspaceSocialSnapshot>((r) => {
      slowResolve = r;
    });

    vi.mocked(fetchWorkspaceSocialForHydrate)
      .mockReturnValueOnce(slowPromise)
      .mockResolvedValue(emptySocial);
    vi.mocked(fetchWorkspaceSocialForRefresh).mockResolvedValue({
      friendIds: [],
      friendRequestsIncoming: [],
      friendRequestsOutgoing: [],
      messageRequests: [],
      blockedUserIds: [],
    });

    const friendIds = ref<string[]>(['stale-peer']);
    const socialGraphStatus = ref<'idle' | 'loading' | 'ready' | 'error'>(
      'idle',
    );
    const mergeDm = vi.fn();

    const hydratePromise = runEchoWorkspaceHydrateFromApi({
      token: 't',
      userId: 'me',
      isGuest: false,
      workspace: {
        consumeSkipEchoWorkspaceHydrate: () => true,
        users: ref([]),
        serverMemberNicknames: ref({}),
        timeoutUntilByServerUser: ref({}),
        lastTimeoutWorkspaceVersion: ref('0'),
        lastTimeoutServerCount: ref(0),
        lastTimeoutMemberKeyCount: ref(0),
        friendIds,
        friendRequestsIncoming: ref([]),
        friendRequestsOutgoing: ref([]),
        messageRequests: ref([]),
        socialGraphStatus,
      },
      echoSession: { applyWorkspaceSnapshot: vi.fn(() => true) },
      serverStore: {
        selectedServerId: null,
        setServers: vi.fn(),
        selectServer: vi.fn(),
        pickPreferredGuildServerId: vi.fn(() => null),
      },
      activeChannelId: ref(''),
      activeRailTab: ref<RailTab>('explore'),
      getFirstTextChannelId: () => '',
      refreshEchoRoleData: vi.fn(() => Promise.resolve()),
      ensureAuthUserInMockUsers: vi.fn(),
      mergeEchoDmThreadsFromApi: mergeDm,
    });

    await runEchoWorkspaceSocialRefreshFromApi({
      token: 't',
      isGuest: false,
      workspace: {
        friendIds,
        blockedUserIds: ref([]),
        friendRequestsIncoming: ref([]),
        friendRequestsOutgoing: ref([]),
        messageRequests: ref([]),
        socialGraphStatus,
      },
    });

    expect(friendIds.value).toEqual([]);

    slowResolve(staleSocial);
    const result = await hydratePromise;
    expect(result).toEqual({ ok: true });
    expect(friendIds.value).toEqual([]);
    expect(mergeDm).not.toHaveBeenCalled();
  });
});

describe('runEchoWorkspaceSocialRefreshFromApi', () => {
  beforeEach(() => {
    vi.mocked(fetchWorkspaceSocialForRefresh).mockReset();
  });

  it('applies refresh slice and runs optional presence sync', async () => {
    const sync = vi.fn();
    vi.mocked(fetchWorkspaceSocialForRefresh).mockResolvedValue({
      friendIds: ['a'],
      friendRequestsIncoming: [{ id: 'i1', fromUserId: 'u1' }],
      friendRequestsOutgoing: [],
      messageRequests: [],
      blockedUserIds: ['u9'],
    });

    const friendIds = ref<string[]>([]);
    const blockedUserIds = ref<string[]>([]);
    const friendRequestsIncoming = ref<{ id: string; fromUserId: string }[]>(
      [],
    );
    const friendRequestsOutgoing = ref<{ id: string; toUserId: string }[]>([]);
    const messageRequests = ref<MessageRequestEntry[]>([]);
    const mergeEchoBlockedFromApi = vi.fn();

    const result = await runEchoWorkspaceSocialRefreshFromApi({
      token: 't',
      isGuest: false,
      workspace: {
        friendIds,
        blockedUserIds,
        friendRequestsIncoming,
        friendRequestsOutgoing,
        messageRequests,
        socialGraphStatus: ref<'idle' | 'loading' | 'ready' | 'error'>('idle'),
      },
      mergeEchoBlockedFromApi,
      syncEchoPresenceFromApi: sync,
    });

    expect(result).toEqual({ ok: true });
    expect(friendIds.value).toEqual(['a']);
    expect(blockedUserIds.value).toEqual(['u9']);
    expect(friendRequestsIncoming.value).toHaveLength(1);
    expect(mergeEchoBlockedFromApi).toHaveBeenCalledWith(['u9']);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('returns ok:false when refresh throws', async () => {
    vi.mocked(fetchWorkspaceSocialForRefresh).mockRejectedValue(new Error('x'));
    const result = await runEchoWorkspaceSocialRefreshFromApi({
      token: 't',
      isGuest: false,
      workspace: {
        friendIds: ref([]),
        blockedUserIds: ref([]),
        friendRequestsIncoming: ref([]),
        friendRequestsOutgoing: ref([]),
        messageRequests: ref<MessageRequestEntry[]>([]),
        socialGraphStatus: ref<'idle' | 'loading' | 'ready' | 'error'>('idle'),
      },
    });
    expect(result.ok).toBe(false);
  });

  it('keeps ready status during background refresh to avoid UI flicker', async () => {
    vi.mocked(fetchWorkspaceSocialForRefresh).mockResolvedValue({
      friendIds: ['u2'],
      friendRequestsIncoming: [],
      friendRequestsOutgoing: [],
      messageRequests: [],
      blockedUserIds: [],
    });
    const socialGraphStatus = ref<'idle' | 'loading' | 'ready' | 'error'>(
      'ready',
    );
    const result = await runEchoWorkspaceSocialRefreshFromApi({
      token: 't',
      isGuest: false,
      workspace: {
        friendIds: ref([]),
        blockedUserIds: ref([]),
        friendRequestsIncoming: ref([]),
        friendRequestsOutgoing: ref([]),
        messageRequests: ref<MessageRequestEntry[]>([]),
        socialGraphStatus,
      },
    });
    expect(result).toEqual({ ok: true });
    expect(socialGraphStatus.value).toBe('ready');
  });

  it('preserves ready status when background refresh fails', async () => {
    vi.mocked(fetchWorkspaceSocialForRefresh).mockRejectedValue(new Error('x'));
    const socialGraphStatus = ref<'idle' | 'loading' | 'ready' | 'error'>(
      'ready',
    );
    const result = await runEchoWorkspaceSocialRefreshFromApi({
      token: 't',
      isGuest: false,
      workspace: {
        friendIds: ref([]),
        blockedUserIds: ref([]),
        friendRequestsIncoming: ref([]),
        friendRequestsOutgoing: ref([]),
        messageRequests: ref<MessageRequestEntry[]>([]),
        socialGraphStatus,
      },
    });
    expect(result.ok).toBe(false);
    expect(socialGraphStatus.value).toBe('ready');
  });

  it('drops stale refresh results when a newer refresh started (overlapping fetches)', async () => {
    const staleSlice = {
      friendIds: ['stale-peer'],
      friendRequestsIncoming: [] as { id: string; fromUserId: string }[],
      friendRequestsOutgoing: [] as { id: string; toUserId: string }[],
      messageRequests: [] as MessageRequestEntry[],
      blockedUserIds: [] as string[],
    };
    const freshSlice = {
      friendIds: [] as string[],
      friendRequestsIncoming: [] as { id: string; fromUserId: string }[],
      friendRequestsOutgoing: [] as { id: string; toUserId: string }[],
      messageRequests: [] as MessageRequestEntry[],
      blockedUserIds: [] as string[],
    };

    let slowResolve!: (v: typeof staleSlice) => void;
    const slowPromise = new Promise<typeof staleSlice>((r) => {
      slowResolve = r;
    });

    vi.mocked(fetchWorkspaceSocialForRefresh)
      .mockReturnValueOnce(slowPromise)
      .mockResolvedValueOnce(freshSlice);

    const friendIds = ref<string[]>(['stale-peer']);
    const workspace = {
      friendIds,
      blockedUserIds: ref<string[]>([]),
      friendRequestsIncoming: ref<{ id: string; fromUserId: string }[]>([]),
      friendRequestsOutgoing: ref<{ id: string; toUserId: string }[]>([]),
      messageRequests: ref<MessageRequestEntry[]>([]),
      socialGraphStatus: ref<'idle' | 'loading' | 'ready' | 'error'>('ready'),
    };

    const first = runEchoWorkspaceSocialRefreshFromApi({
      token: 't',
      isGuest: false,
      workspace,
    });
    const second = runEchoWorkspaceSocialRefreshFromApi({
      token: 't',
      isGuest: false,
      workspace,
    });

    await second;
    expect(friendIds.value).toEqual([]);

    slowResolve(staleSlice);
    await first;
    expect(friendIds.value).toEqual([]);
  });
});
