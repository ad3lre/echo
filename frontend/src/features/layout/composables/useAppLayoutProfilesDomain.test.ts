import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type { ChannelSummary } from '@shared/types';
import type * as EchoSocialApi from '@/api/echo/social';
import type * as EchoClientApi from '@/api/echoClient';
import { useAppLayoutProfilesDomain } from './useAppLayoutProfilesDomain';
import {
  fetchEchoMutualFriends,
  postEchoRemoveFriend,
} from '@/api/echo/social';
import { deleteEchoUnblockUser, postEchoBlockUser } from '@/api/echoClient';
import { openReportModal } from '@/features/safety/reportModal';
import { invalidateInFlightEchoWorkspaceSocialRefresh } from '@/services/orchestration/workspaceEchoHydrateFromApi';

vi.mock('@/features/safety/reportModal', () => ({
  openReportModal: vi.fn(),
}));

vi.mock('@/services/orchestration/workspaceEchoHydrateFromApi', () => ({
  invalidateInFlightEchoWorkspaceSocialRefresh: vi.fn(),
}));

vi.mock('@/api/echo/social', async (importOriginal) => {
  const actual = await importOriginal<typeof EchoSocialApi>();
  return {
    ...actual,
    fetchEchoMutualFriends: vi.fn(),
    postEchoRemoveFriend: vi.fn(),
  };
});

vi.mock('@/api/echoClient', async (importOriginal) => {
  const actual = await importOriginal<typeof EchoClientApi>();
  return {
    ...actual,
    postEchoBlockUser: vi.fn(),
    deleteEchoUnblockUser: vi.fn(),
    patchEchoMemberNickname: vi.fn(),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createDomain() {
  type TestUser = {
    id: string;
    name: string;
    pfp: string;
    status?: string;
    isDiscordShadow?: boolean;
  };
  const users = ref<TestUser[]>([
    { id: 'self', name: 'Self', pfp: 'self.png', status: 'online' },
    { id: 'u1', name: 'Alpha', pfp: 'a.png', status: 'offline' },
    { id: 'u3', name: 'Beta', pfp: 'b.png', status: 'online' },
    {
      id: 'u2',
      name: 'Shadow',
      pfp: 's.png',
      status: 'online',
      isDiscordShadow: true,
    },
  ]);
  const workspace = {
    users,
    servers: ref([{ id: 's1', name: 'Server 1' }]),
    serverMemberIds: ref<Record<string, string[]>>({
      s1: ['self', 'u1', 'u3', 'u2'],
    }),
    serverMemberNicknames: ref<Record<string, Record<string, string>>>({
      s1: { u1: 'Nick Alpha' },
    }),
    friendIdsByUserId: ref<Record<string, string[]>>({}),
    friendIds: ref<string[]>(['u1']),
    friendRequestsIncoming: ref<Array<{ id: string; fromUserId: string }>>([
      { id: 'req-in-1', fromUserId: 'u3' },
    ]),
    friendRequestsOutgoing: ref<Array<{ id: string; toUserId: string }>>([
      { id: 'req-1', toUserId: 'u1' },
    ]),
    blockedUserIds: ref<string[]>([]),
    refreshEchoSocialFromApi: vi.fn(async () => undefined),
    acceptFriendRequest: vi.fn(),
    declineFriendRequest: vi.fn(),
    cancelFriendRequest: vi.fn(),
  };

  const authSession = {
    accessToken: 'token',
    isAuthenticated: true,
    backendUser: {
      id: 'self',
      isGuest: false,
      status: 'idle',
      customStatus: 'coding',
    },
  };

  const deps = {
    workspace,
    authSession,
    serverStore: { selectedServerId: 's1' },
    currentUser: computed(() => ({
      id: 'self',
      name: 'Self',
      pfp: 'self.png',
    })),
    activeChannel: computed(
      () =>
        ({
          id: 'c1',
          name: 'general',
          type: 'text',
          accessibleMemberUserIds: ['self', 'u1'],
        }) as ChannelSummary,
    ),
    selectedServerEcho: computed(() => ({ id: 's1', name: 'Server 1' })),
    selectedServerView: computed(() => ({ id: 's1', name: 'Server 1' })),
    customStatus: ref(''),
    echoBlockedUserIds: ref(new Set<string>()),
    isMemberPopoutOpen: ref(false),
    isSelfProfilePopoutOpen: ref(false),
    isExpandedProfileModalOpen: ref(false),
    isExpandedProfileSidePanel: ref(false),
    isGroupOverviewOpen: ref(false),
    activeMemberProfile: ref<unknown | null>(null),
    expandedProfile: ref<any | null>(null),
    profileNotes: ref<Record<string, string>>({}),
    memberPopoutAnchor: ref(null),
    selfProfileAnchor: ref(null),
    selfProfile: ref<TestUser | null>({
      id: 'self',
      name: 'Self',
      pfp: 'self.png',
    }),
    isInDMChat: ref(false),
    isInDMMode: ref(false),
    leaveDmUiIfViewingUser: vi.fn(),
    canChangeMemberNicknameInServer: vi.fn(() => true),
    hydrateEchoFromApi: vi.fn(async () => undefined),
    refreshEchoRoleData: vi.fn(),
    workspaceMembersByServer: ref({
      s1: [
        { userId: 'self', name: 'Self', pfp: 'self.png', isGuest: false },
        { userId: 'u1', name: 'Alpha', pfp: 'a.png', isGuest: true },
        { userId: 'u3', name: 'Beta', pfp: 'b.png', isGuest: false },
        {
          userId: 'u2',
          name: 'Shadow',
          pfp: 's.png',
          isDiscordShadow: true,
        },
      ],
    }),
    presenceByUserId: ref<Record<string, string | undefined>>({
      u1: 'do_not_disturb',
    }),
    presenceMobileByUserId: ref<Record<string, true>>({}),
    expandedProfileTargetUserId: ref<string | null>(null),
  };

  return { domain: useAppLayoutProfilesDomain(deps), deps };
}

describe('useAppLayoutProfilesDomain', () => {
  beforeAll(() => {
    setActivePinia(createPinia());
  });

  beforeEach(() => {
    vi.mocked(fetchEchoMutualFriends).mockReset();
    vi.mocked(postEchoRemoveFriend).mockReset();
    vi.mocked(postEchoBlockUser).mockReset();
    vi.mocked(deleteEchoUnblockUser).mockReset();
    vi.mocked(openReportModal).mockReset();
    vi.stubGlobal('window', {
      confirm: vi.fn(() => true),
      alert: vi.fn(),
      prompt: vi.fn(() => null),
      matchMedia: vi.fn((query: string) => ({
        matches: query.includes('min-width: 1024px'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
  });

  it('builds member list projection with nickname, status overlay, and shadow filtering', () => {
    const { domain } = createDomain();
    const members = domain.memberListUsers.value;
    expect(members.map((m: { id: string }) => m.id)).toEqual(['self', 'u1']);
    expect(members.find((m: { id: string }) => m.id === 'u1')).toMatchObject({
      name: 'Nick Alpha',
      status: 'do_not_disturb',
      isGuest: true,
    });
    expect(members.find((m: { id: string }) => m.id === 'self')).toMatchObject({
      status: 'idle',
      customStatus: 'coding',
    });
  });

  it('accepts and declines incoming friend requests by request id', () => {
    const { domain, deps } = createDomain();
    domain.handleExpandedProfileAcceptIncomingFriendRequest('u3');
    expect(deps.workspace.acceptFriendRequest).toHaveBeenCalledWith('req-in-1');
    domain.handleExpandedProfileDeclineIncomingFriendRequest('u3');
    expect(deps.workspace.declineFriendRequest).toHaveBeenCalledWith(
      'req-in-1',
    );
  });

  it('routes block/unblock/report safety actions through APIs', async () => {
    const { domain, deps } = createDomain();
    await domain.handleProfileBlockUser('u1');
    expect(deps.workspace.blockedUserIds.value).toEqual(['u1']);
    await domain.handleProfileUnblockUser('u1');
    expect(deps.workspace.blockedUserIds.value).toEqual([]);
    await domain.handleProfileReportUser({ userId: 'u1', reason: 'spam' });
    expect(postEchoBlockUser).toHaveBeenCalledWith('token', 'u1');
    expect(deleteEchoUnblockUser).toHaveBeenCalledWith('token', 'u1');
    expect(openReportModal).toHaveBeenCalledWith({
      kind: 'user',
      targetUserId: 'u1',
      displayName: 'Alpha',
    });
  });

  it('optimistically removes friend before unfriend API resolves', async () => {
    const { domain, deps } = createDomain();
    const pending = deferred<void>();
    vi.mocked(postEchoRemoveFriend).mockReturnValueOnce(pending.promise);
    deps.workspace.friendIds.value = ['u1', 'u3'];

    const task = domain.removeFriend('u1');
    expect(invalidateInFlightEchoWorkspaceSocialRefresh).toHaveBeenCalled();
    expect(deps.workspace.friendIds.value).toEqual(['u3']);
    pending.resolve();
    await task;

    expect(postEchoRemoveFriend).toHaveBeenCalledWith('token', 'u1');
    expect(deps.workspace.refreshEchoSocialFromApi).toHaveBeenCalled();
  });

  it('ignores stale mutual-friend response when expanded profile changes', async () => {
    const first = deferred<{ userIds: string[] }>();
    vi.mocked(fetchEchoMutualFriends)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ userIds: [] });
    const { domain: _domain, deps } = createDomain();
    deps.expandedProfile.value = { id: 'u1', mutualFriends: [] };
    deps.isExpandedProfileModalOpen.value = true;
    await nextTick();
    deps.expandedProfile.value = { id: 'self', mutualFriends: [] };
    await nextTick();
    first.resolve({ userIds: ['u1'] });
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.expandedProfile.value.id).toBe('self');
    expect(
      Array.isArray(deps.expandedProfile.value.mutualFriends)
        ? deps.expandedProfile.value.mutualFriends.length
        : 0,
    ).toBe(0);
  });
});
