import type { Ref } from 'vue';
import { unref } from 'vue';
import type {
  FriendRequestIncomingEntry,
  FriendRequestOutgoingEntry,
  MessageRequestEntry,
} from '@/features/layout/echoWorkspace/types';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { useAuthSessionStore } from '@/features/auth/authSession';
import {
  postEchoAcceptMessageRequest,
  postEchoFriendRequest,
  postEchoAcceptFriend,
  postEchoDeclineFriend,
  postEchoCancelFriendRequest,
  postEchoIgnoreMessageRequest,
} from '@/api/echoClient';
import { isEchoAuthUserId } from '@/features/layout/ids/echoIds';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import { reportPrimaryFlowFailure } from '@/features/layout/failures/primaryFlowFailure';
import type { DmSubView } from '@/features/layout/mainSurface';

type SelectServer = (serverId: string | null) => void;

function friendSocialFailureToast(flow: string, e: unknown, fallback: string) {
  reportPrimaryFlowFailure(flow, e, undefined, { showBanner: false });
  const msg =
    e instanceof Error && e.message.trim() ? e.message.trim() : fallback;
  dispatchAppToast(msg, 'warning');
}

export function useDmSocialActions(params: {
  currentUserId: Ref<string | undefined | null>;
  messageRequests: Ref<MessageRequestEntry[]>;
  friendRequestsIncoming: Ref<FriendRequestIncomingEntry[]>;
  friendRequestsOutgoing: Ref<FriendRequestOutgoingEntry[]>;
  friendIds: Ref<string[]>;
  selectedMessageRequestId: Ref<string | null>;
  dmActiveTab: Ref<DmSubView>;
  activeChannelId: Ref<string>;
  pfpBarExpanded: Ref<boolean>;
  selectServer: SelectServer;
  /** Re-fetch friends + pending requests from Echo API (Echo mode). */
  refreshFriendSocialFromApi?: () => Promise<void>;
}) {
  const {
    currentUserId,
    messageRequests,
    friendRequestsIncoming,
    friendRequestsOutgoing,
    friendIds,
    selectedMessageRequestId,
    dmActiveTab,
    activeChannelId,
    pfpBarExpanded,
    selectServer,
    refreshFriendSocialFromApi,
  } = params;

  const authSession = useAuthSessionStore();

  function selectMessageRequest(requestId: string | null) {
    selectedMessageRequestId.value = requestId;
    if (requestId) {
      dmActiveTab.value = 'messages';
    }
    if (!requestId) return;
    const req = messageRequests.value.find((entry) => entry.id === requestId);
    if (!req) return;
    activeChannelId.value = echoSyncCapabilities.isMockDataMode
      ? `dm-${req.fromUserId}`
      : req.channelId;
    selectServer('echo');
    pfpBarExpanded.value = false;
  }

  async function ignoreMessageRequest(requestId: string) {
    const req = messageRequests.value.find((r) => r.id === requestId);
    if (
      !echoSyncCapabilities.isMockDataMode &&
      authSession.isAuthenticated &&
      req &&
      isEchoAuthUserId(req.fromUserId)
    ) {
      try {
        await postEchoIgnoreMessageRequest(
          authSession.accessToken ?? '',
          req.id,
        );
      } catch (e) {
        friendSocialFailureToast(
          'ignoreMessageRequest',
          e,
          'Could not dismiss this request. Try again.',
        );
        return;
      }
      await refreshFriendSocialFromApi?.();
      messageRequests.value = messageRequests.value.filter(
        (r) => r.id !== requestId,
      );
      if (selectedMessageRequestId.value === requestId) {
        selectedMessageRequestId.value = null;
      }
      return;
    }
    messageRequests.value = messageRequests.value.filter(
      (r) => r.id !== requestId,
    );
    if (selectedMessageRequestId.value === requestId) {
      selectedMessageRequestId.value = null;
    }
  }

  async function acceptMessageRequest(
    requestId: string,
  ): Promise<MessageRequestEntry | null> {
    const req = messageRequests.value.find((r) => r.id === requestId);
    if (!req) return null;
    if (
      !echoSyncCapabilities.isMockDataMode &&
      authSession.isAuthenticated &&
      isEchoAuthUserId(req.fromUserId)
    ) {
      try {
        await postEchoAcceptMessageRequest(
          authSession.accessToken ?? '',
          req.id,
        );
      } catch (e) {
        friendSocialFailureToast(
          'acceptMessageRequest',
          e,
          'Could not accept this message request. Try again.',
        );
        return null;
      }
      await refreshFriendSocialFromApi?.();
    }
    messageRequests.value = messageRequests.value.filter(
      (r) => r.id !== requestId,
    );
    if (selectedMessageRequestId.value === requestId) {
      selectedMessageRequestId.value = null;
    }
    dmActiveTab.value = 'messages';
    return req;
  }

  function returnFromMessageRequests() {
    dmActiveTab.value = 'messages';
    selectedMessageRequestId.value = null;
  }

  async function acceptFriendRequest(requestId: string) {
    const key = requestId.trim();
    const req = friendRequestsIncoming.value.find(
      (r) => r.id === key || r.fromUserId === key,
    );
    if (!req) return;
    if (
      !echoSyncCapabilities.isMockDataMode &&
      authSession.isAuthenticated &&
      isEchoAuthUserId(req.fromUserId)
    ) {
      try {
        await postEchoAcceptFriend(
          authSession.accessToken ?? '',
          req.fromUserId,
        );
      } catch (e) {
        friendSocialFailureToast(
          'acceptFriendRequest',
          e,
          'Could not accept this friend request. Try again.',
        );
        return;
      }
      await refreshFriendSocialFromApi?.();
      return;
    }
    if (!friendIds.value.includes(req.fromUserId)) {
      friendIds.value = [...friendIds.value, req.fromUserId];
    }
    friendRequestsIncoming.value = friendRequestsIncoming.value.filter(
      (r) => r.id !== req.id,
    );
  }

  async function declineFriendRequest(requestId: string) {
    const key = requestId.trim();
    const req = friendRequestsIncoming.value.find(
      (r) => r.id === key || r.fromUserId === key,
    );
    if (!req) return;
    if (
      !echoSyncCapabilities.isMockDataMode &&
      authSession.isAuthenticated &&
      isEchoAuthUserId(req.fromUserId)
    ) {
      try {
        await postEchoDeclineFriend(
          authSession.accessToken ?? '',
          req.fromUserId,
        );
      } catch (e) {
        friendSocialFailureToast(
          'declineFriendRequest',
          e,
          'Could not decline this friend request. Try again.',
        );
        return;
      }
      await refreshFriendSocialFromApi?.();
      return;
    }
    friendRequestsIncoming.value = friendRequestsIncoming.value.filter(
      (r) => r.id !== req.id,
    );
  }

  async function cancelFriendRequest(requestId: string) {
    const key = requestId.trim();
    const req = friendRequestsOutgoing.value.find(
      (r) => r.id === key || r.toUserId === key,
    );
    if (!req) return;
    if (
      !echoSyncCapabilities.isMockDataMode &&
      authSession.isAuthenticated &&
      isEchoAuthUserId(req.toUserId)
    ) {
      try {
        await postEchoCancelFriendRequest(
          authSession.accessToken ?? '',
          req.toUserId,
        );
      } catch (e) {
        friendSocialFailureToast(
          'cancelFriendRequest',
          e,
          'Could not cancel this friend request. Try again.',
        );
        return;
      }
      await refreshFriendSocialFromApi?.();
      return;
    }
    friendRequestsOutgoing.value = friendRequestsOutgoing.value.filter(
      (r) => r.id !== requestId,
    );
  }

  async function sendFriendRequest(toUserId: string) {
    const selfId = unref(currentUserId) ?? authSession.backendUser?.id;
    if (selfId && toUserId === selfId) {
      dispatchAppToast(
        'You cannot send a friend request to yourself.',
        'warning',
      );
      return;
    }
    if (friendIds.value.includes(toUserId)) {
      dispatchAppToast('You are already friends with this user.', 'warning');
      return;
    }
    if (friendRequestsOutgoing.value.some((r) => r.toUserId === toUserId)) {
      dispatchAppToast(
        'A friend request is already pending for this user.',
        'warning',
      );
      return;
    }
    if (
      !echoSyncCapabilities.isMockDataMode &&
      authSession.isAuthenticated &&
      authSession.backendUser?.isGuest === true
    ) {
      dispatchAppToast(
        'Add an email and password to use Friends and social features.',
        'warning',
      );
      return;
    }
    if (!echoSyncCapabilities.isMockDataMode && authSession.isAuthenticated) {
      if (!isEchoAuthUserId(toUserId)) {
        dispatchAppToast(
          'This profile cannot receive Echo friend requests (invalid user id).',
          'warning',
        );
        return;
      }
      try {
        await postEchoFriendRequest(authSession.accessToken ?? '', toUserId);
      } catch (e) {
        friendSocialFailureToast(
          'sendFriendRequest',
          e,
          'Could not send friend request.',
        );
        return;
      }
      await refreshFriendSocialFromApi?.();
      return;
    }
    friendRequestsOutgoing.value = [
      ...friendRequestsOutgoing.value,
      { id: `fro-${Date.now()}`, toUserId },
    ];
  }

  return {
    selectMessageRequest,
    acceptMessageRequest,
    ignoreMessageRequest,
    returnFromMessageRequests,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    sendFriendRequest,
  };
}
