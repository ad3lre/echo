import { computed, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useDmSurfaceAdapter } from '../dm/useDmSurfaceAdapter';
import { useProfileSurfaceAdapter } from '../profiles/useProfileSurfaceAdapter';
import { useChatHeaderAdapter } from '../messaging/useChatHeaderAdapter';

describe('region adapters', () => {
  it('derives chat header state from dm/profile adapters through one canonical path', () => {
    const openExpandedProfilePanelForUserId = vi.fn();
    const openExtendedProfileModalForUserId = vi.fn();
    const openGroupOverviewPanel = vi.fn();
    const openGroupSettingsFromHeader = vi.fn();

    const dmSurface = useDmSurfaceAdapter({
      dmPartnerUser: computed(() => ({
        id: 'u1',
        name: 'Ada',
        pfp: '/ada.png',
        status: 'online',
      })),
      activeGroupDM: computed(() => null),
      activeDmThreadCallUi: computed(() => null),
      isGroupDM: computed(() => false),
      isInDMMode: computed(() => true),
      isInDMChat: computed(() => true),
      dmActiveTab: computed(() => 'messages' as const),
      presenceByUserId: computed(() => ({ u1: 'online' })),
      presenceMobileByUserId: computed(() => ({ u1: true })),
      activeGroupCallMembers: computed(() => []),
      openExpandedProfilePanelForUserId,
      openExtendedProfileModalForUserId,
      openGroupOverviewPanel,
      openGroupSettingsFromHeader,
    });

    const profileSurface = useProfileSurfaceAdapter({
      currentUserId: computed(() => 'viewer'),
      expandedProfile: computed(() => null),
      expandedProfileLoading: computed(() => false),
      expandedProfileNote: computed(() => ''),
      isExpandedProfileSidePanel: computed(() => true),
      isExpandedProfileModalOpen: computed(() => true),
      isExpandedProfileTargetBlocked: computed(() => false),
      friendshipKnown: computed(() => true),
      friendIds: computed(() => ['u1']),
      friendIdsByUserId: computed(() => ({ viewer: ['u1'] })),
      friendRequestsIncoming: computed(() => []),
      friendRequestsOutgoing: computed(() => []),
      blockedUserIds: computed(() => []),
      guestFriendsLocked: computed(() => false),
      presenceMobileByUserId: computed(() => ({ u1: true })),
      hideOpenDmButton: computed(() => true),
      onUpdateExpandedProfileNote: vi.fn(),
      onExpandedProfileModalUpdate: vi.fn(),
      handleExpandedProfileOpenServer: vi.fn(),
      handleExpandedProfileOpenProfile: vi.fn(),
      expandDmProfileToFullModal: vi.fn(),
      handleExpandedProfileOpenDM: vi.fn(),
      handleExpandedProfileSendFriendRequest: vi.fn(),
      handleExpandedProfileCancelOutgoingFriendRequest: vi.fn(),
      handleExpandedProfileAcceptIncomingFriendRequest: vi.fn(),
      handleExpandedProfileDeclineIncomingFriendRequest: vi.fn(),
      handleExpandedProfileRemoveFriend: vi.fn(),
      handleProfileBlockUser: vi.fn(),
      handleProfileUnblockUser: vi.fn(),
      handleProfileReportUser: vi.fn(),
    });

    const chatHeader = useChatHeaderAdapter({
      dmSurface,
      profileSurface,
    });

    expect(chatHeader.model.value.dm.partnerUser?.id).toBe('u1');
    expect(chatHeader.model.value.profile.isExpandedProfileSidePanel).toBe(
      true,
    );

    chatHeader.intents.openProfilePanelForUserId('u1');
    chatHeader.intents.openProfileModal('u1');

    expect(openExpandedProfilePanelForUserId).toHaveBeenCalledWith('u1');
    expect(openExtendedProfileModalForUserId).toHaveBeenCalledWith('u1');
  });

  it('keeps profile surface friend state and intents in one adapter contract', () => {
    const note = ref('hello');
    const profile = useProfileSurfaceAdapter({
      currentUserId: computed(() => 'viewer'),
      expandedProfile: computed(() => ({ id: 'u2', name: 'Grace' }) as never),
      expandedProfileLoading: computed(() => false),
      expandedProfileNote: computed(() => note.value),
      isExpandedProfileSidePanel: computed(() => false),
      isExpandedProfileModalOpen: computed(() => true),
      isExpandedProfileTargetBlocked: computed(() => false),
      friendshipKnown: computed(() => true),
      friendIds: computed(() => []),
      friendIdsByUserId: computed(() => ({ viewer: [] })),
      friendRequestsIncoming: computed(() => [{ id: 'r1', fromUserId: 'u2' }]),
      friendRequestsOutgoing: computed(() => []),
      blockedUserIds: computed(() => []),
      guestFriendsLocked: computed(() => false),
      presenceMobileByUserId: computed(() => undefined),
      hideOpenDmButton: computed(() => false),
      onUpdateExpandedProfileNote: (next) => {
        note.value = next;
      },
      onExpandedProfileModalUpdate: vi.fn(),
      handleExpandedProfileOpenServer: vi.fn(),
      handleExpandedProfileOpenProfile: vi.fn(),
      expandDmProfileToFullModal: vi.fn(),
      handleExpandedProfileOpenDM: vi.fn(),
      handleExpandedProfileSendFriendRequest: vi.fn(),
      handleExpandedProfileCancelOutgoingFriendRequest: vi.fn(),
      handleExpandedProfileAcceptIncomingFriendRequest: vi.fn(),
      handleExpandedProfileDeclineIncomingFriendRequest: vi.fn(),
      handleExpandedProfileRemoveFriend: vi.fn(),
      handleProfileBlockUser: vi.fn(),
      handleProfileUnblockUser: vi.fn(),
      handleProfileReportUser: vi.fn(),
    });

    expect(profile.model.value.friendshipKnown).toBe(true);
    expect(profile.model.value.friendRequestsIncoming[0]?.fromUserId).toBe(
      'u2',
    );

    profile.intents.updateNote('updated');
    expect(profile.model.value.expandedProfileNote).toBe('updated');
  });
});
