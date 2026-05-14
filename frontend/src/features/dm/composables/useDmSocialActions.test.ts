import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useDmSocialActions } from './useDmSocialActions';
import { useAuthSessionStore } from '@/stores/authSession';

vi.mock('@/utils/controllerMissingAction', () => ({
  dispatchAppToast: vi.fn(),
}));

vi.mock('@/utils/primaryFlowFailure', () => ({
  reportPrimaryFlowFailure: vi.fn(),
}));

vi.mock('@/api/echoClient', () => ({
  postEchoFriendRequest: vi.fn().mockResolvedValue(undefined),
  postEchoAcceptFriend: vi.fn().mockResolvedValue(undefined),
  postEchoDeclineFriend: vi.fn().mockResolvedValue(undefined),
  postEchoCancelFriendRequest: vi.fn().mockResolvedValue(undefined),
  postEchoAcceptMessageRequest: vi.fn().mockResolvedValue({
    channelId: 'mr-channel-1',
    peerUserId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  }),
  postEchoIgnoreMessageRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/platform/syncCapabilities', () => ({
  echoSyncCapabilities: { isMockDataMode: false },
}));

import {
  postEchoAcceptMessageRequest,
  postEchoFriendRequest,
  postEchoAcceptFriend,
  postEchoDeclineFriend,
  postEchoCancelFriendRequest,
  postEchoIgnoreMessageRequest,
} from '@/api/echoClient';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

const peerUuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('useDmSocialActions', () => {
  beforeEach(() => {
    const storage: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => {
        storage[k] = v;
      },
      removeItem: (k: string) => {
        delete storage[k];
      },
      clear: () => {
        for (const k of Object.keys(storage)) delete storage[k];
      },
      key: () => null,
      get length() {
        return Object.keys(storage).length;
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(postEchoFriendRequest).mockResolvedValue(undefined);
    const auth = useAuthSessionStore();
    auth.setSession({
      user: {
        id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        username: 'me',
        displayName: 'Me',
        pfp: '',
        status: 'online',
        createdAt: '2020-01-01T00:00:00.000Z',
      },
    });
  });

  it('does not add peer to friendIds when sending a friend request (Echo mode)', async () => {
    const friendIds = ref<string[]>([]);
    const outgoing = ref<{ id: string; toUserId: string }[]>([]);
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { sendFriendRequest } = useDmSocialActions({
      currentUserId: ref('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'),
      messageRequests: ref([]),
      friendRequestsIncoming: ref([]),
      friendRequestsOutgoing: outgoing,
      friendIds,
      selectedMessageRequestId: ref(null),
      dmActiveTab: ref('friends'),
      activeChannelId: ref('general'),
      pfpBarExpanded: ref(false),
      selectServer: () => {},
      refreshFriendSocialFromApi: refresh,
    });

    await sendFriendRequest(peerUuid);
    expect(postEchoFriendRequest).toHaveBeenCalledWith('', peerUuid);
    expect(refresh).toHaveBeenCalled();
    expect(friendIds.value.includes(peerUuid)).toBe(false);
  });

  it('does not call API when viewer is a guest in Echo mode; shows toast', async () => {
    const auth = useAuthSessionStore();
    auth.setSession({
      user: {
        id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        username: 'guest',
        displayName: 'Guest',
        pfp: '',
        status: 'online',
        createdAt: '2020-01-01T00:00:00.000Z',
        isGuest: true,
      },
    });

    const outgoing = ref<{ id: string; toUserId: string }[]>([]);
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { sendFriendRequest } = useDmSocialActions({
      currentUserId: ref('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'),
      messageRequests: ref([]),
      friendRequestsIncoming: ref([]),
      friendRequestsOutgoing: outgoing,
      friendIds: ref([]),
      selectedMessageRequestId: ref(null),
      dmActiveTab: ref('friends'),
      activeChannelId: ref('general'),
      pfpBarExpanded: ref(false),
      selectServer: () => {},
      refreshFriendSocialFromApi: refresh,
    });

    await sendFriendRequest(peerUuid);
    expect(postEchoFriendRequest).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(dispatchAppToast).toHaveBeenCalled();
  });

  it('shows toast when friend request API throws in Echo mode', async () => {
    vi.mocked(postEchoFriendRequest).mockRejectedValueOnce(
      new Error('Guest accounts cannot be added as friends.'),
    );
    const outgoing = ref<{ id: string; toUserId: string }[]>([]);
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { sendFriendRequest } = useDmSocialActions({
      currentUserId: ref('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'),
      messageRequests: ref([]),
      friendRequestsIncoming: ref([]),
      friendRequestsOutgoing: outgoing,
      friendIds: ref([]),
      selectedMessageRequestId: ref(null),
      dmActiveTab: ref('friends'),
      activeChannelId: ref('general'),
      pfpBarExpanded: ref(false),
      selectServer: () => {},
      refreshFriendSocialFromApi: refresh,
    });

    await sendFriendRequest(peerUuid);
    expect(refresh).not.toHaveBeenCalled();
    expect(dispatchAppToast).toHaveBeenCalledWith(
      'Guest accounts cannot be added as friends.',
      'warning',
    );
  });

  it('refreshes social state after accept in Echo mode', async () => {
    const incoming = ref([{ id: 'req-1', fromUserId: peerUuid }]);
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { acceptFriendRequest } = useDmSocialActions({
      currentUserId: ref('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'),
      messageRequests: ref([]),
      friendRequestsIncoming: incoming,
      friendRequestsOutgoing: ref([]),
      friendIds: ref([]),
      selectedMessageRequestId: ref(null),
      dmActiveTab: ref('friends'),
      activeChannelId: ref('general'),
      pfpBarExpanded: ref(false),
      selectServer: () => {},
      refreshFriendSocialFromApi: refresh,
    });

    await acceptFriendRequest('req-1');
    expect(postEchoAcceptFriend).toHaveBeenCalledWith('', peerUuid);
    expect(refresh).toHaveBeenCalled();
  });

  it('accepts using fromUserId key (profile action path)', async () => {
    const incoming = ref([{ id: 'req-2', fromUserId: peerUuid }]);
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { acceptFriendRequest } = useDmSocialActions({
      currentUserId: ref('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'),
      messageRequests: ref([]),
      friendRequestsIncoming: incoming,
      friendRequestsOutgoing: ref([]),
      friendIds: ref([]),
      selectedMessageRequestId: ref(null),
      dmActiveTab: ref('friends'),
      activeChannelId: ref('general'),
      pfpBarExpanded: ref(false),
      selectServer: () => {},
      refreshFriendSocialFromApi: refresh,
    });

    await acceptFriendRequest(peerUuid);
    expect(postEchoAcceptFriend).toHaveBeenCalledWith('', peerUuid);
    expect(refresh).toHaveBeenCalled();
  });

  it('calls decline and cancel APIs in Echo mode', async () => {
    const incoming = ref([{ id: 'i1', fromUserId: peerUuid }]);
    const outgoing = ref([{ id: 'o1', toUserId: peerUuid }]);
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { declineFriendRequest, cancelFriendRequest } = useDmSocialActions({
      currentUserId: ref('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'),
      messageRequests: ref([]),
      friendRequestsIncoming: incoming,
      friendRequestsOutgoing: outgoing,
      friendIds: ref([]),
      selectedMessageRequestId: ref(null),
      dmActiveTab: ref('friends'),
      activeChannelId: ref('general'),
      pfpBarExpanded: ref(false),
      selectServer: () => {},
      refreshFriendSocialFromApi: refresh,
    });

    await declineFriendRequest('i1');
    expect(postEchoDeclineFriend).toHaveBeenCalledWith('', peerUuid);

    await cancelFriendRequest('o1');
    expect(postEchoCancelFriendRequest).toHaveBeenCalledWith('', peerUuid);
  });

  it('declines friend when ignoring a message request in Echo mode', async () => {
    const messageRequests = ref([
      {
        id: 'mr-1',
        channelId: 'mr-channel-1',
        fromUserId: peerUuid,
        preview: 'hi',
      },
    ]);
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { ignoreMessageRequest } = useDmSocialActions({
      currentUserId: ref('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'),
      messageRequests,
      friendRequestsIncoming: ref([]),
      friendRequestsOutgoing: ref([]),
      friendIds: ref([]),
      selectedMessageRequestId: ref('mr-1'),
      dmActiveTab: ref('messages'),
      activeChannelId: ref('general'),
      pfpBarExpanded: ref(false),
      selectServer: () => {},
      refreshFriendSocialFromApi: refresh,
    });

    await ignoreMessageRequest('mr-1');
    expect(postEchoIgnoreMessageRequest).toHaveBeenCalledWith('', 'mr-1');
    expect(refresh).toHaveBeenCalled();
    expect(messageRequests.value.some((r) => r.id === 'mr-1')).toBe(false);
  });

  it('accepts a message request without turning it into a friend request', async () => {
    const messageRequests = ref([
      {
        id: 'mr-1',
        channelId: 'mr-channel-1',
        fromUserId: peerUuid,
        preview: 'hello',
      },
    ]);
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { acceptMessageRequest } = useDmSocialActions({
      currentUserId: ref('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'),
      messageRequests,
      friendRequestsIncoming: ref([]),
      friendRequestsOutgoing: ref([]),
      friendIds: ref([]),
      selectedMessageRequestId: ref('mr-1'),
      dmActiveTab: ref('messages'),
      activeChannelId: ref('general'),
      pfpBarExpanded: ref(false),
      selectServer: () => {},
      refreshFriendSocialFromApi: refresh,
    });

    const accepted = await acceptMessageRequest('mr-1');
    expect(postEchoAcceptMessageRequest).toHaveBeenCalledWith('', 'mr-1');
    expect(postEchoAcceptFriend).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(accepted?.channelId).toBe('mr-channel-1');
    expect(messageRequests.value.some((r) => r.id === 'mr-1')).toBe(false);
  });
});
