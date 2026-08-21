import { computed, watch } from 'vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { createEchoServerMemberOrchestration } from '@/features/layout/echoWorkspace/echoServerMemberOrchestration';
import type { WireAppLayoutVoiceAndRealtimeResult } from '../controller/wireAppLayoutVoiceAndRealtime';
import { useComputedRefAlias } from '../controller/useComputedRefAlias';
import { useComputedOptionalRefAlias } from '../controller/useComputedOptionalRefAlias';
import { useDmSurfaceAdapter } from '../dm/useDmSurfaceAdapter';
import { useProfileSurfaceAdapter } from '../profiles/useProfileSurfaceAdapter';
import { useChatHeaderAdapter } from './useChatHeaderAdapter';
import type { useAppLayoutMessagingProfilesSetup } from '../controller/useAppLayoutMessagingProfilesSetup';
import type { useAppLayoutMessagingGroupDmChrome } from '../dm/useAppLayoutMessagingGroupDmChrome';

type Phase2 = WireAppLayoutVoiceAndRealtimeResult;
type Profiles = ReturnType<typeof useAppLayoutMessagingProfilesSetup>;
type GroupDmChrome = ReturnType<typeof useAppLayoutMessagingGroupDmChrome>;

export type UseAppLayoutMessagingSurfaceAdaptersExtras = {
  profiles: Profiles;
  groupDmActions: GroupDmChrome['groupDmActions'];
  handleExpandedProfileOpenServer: (serverId: string) => void;
};

export function expandedProfileHidesOpenDmButton(
  profileId: string | undefined,
  selectedDmUserId: string | null | undefined,
): boolean {
  const pid = profileId?.trim();
  if (!pid) return false;
  const selected = selectedDmUserId?.trim();
  return !!selected && selected === pid;
}

function wireFriendshipAndHideDm(phase2: Phase2, profiles: Profiles) {
  const friendshipKnownComputed = computed(
    () =>
      echoSyncCapabilities.isMockDataMode ||
      phase2.workspace.socialGraphStatus.value === 'ready',
  );
  const expandedProfileHideOpenDmButtonComputed = computed(() =>
    expandedProfileHidesOpenDmButton(
      phase2.expandedProfile.value?.id,
      phase2.selectedDMUserId.value,
    ),
  );
  return {
    friendshipKnownComputed,
    expandedProfileHideOpenDmButtonComputed,
  };
}

function wireDmSurfaceAdapter(
  phase2: Phase2,
  extras: UseAppLayoutMessagingSurfaceAdaptersExtras,
) {
  const { profiles } = extras;
  return useDmSurfaceAdapter({
    dmPartnerUser: phase2.dmPartnerUser,
    activeGroupDM: phase2.activeGroupDM,
    activeDmThreadCallUi: phase2.activeDmThreadCallUi,
    isGroupDM: phase2.isGroupDMComputed,
    isInDMMode: phase2.isInDMModeComputed,
    isInDMChat: phase2.isInDmThreadOrIdleMainSurface,
    dmActiveTab: useComputedRefAlias(phase2.dmActiveTab),
    presenceByUserId: useComputedRefAlias(phase2.presenceByUserId),
    presenceMobileByUserId: useComputedOptionalRefAlias(
      phase2.presenceMobileByUserId,
    ),
    activeGroupCallMembers: phase2.activeGroupCallMembersVisible,
    openExpandedProfilePanelForUserId:
      profiles.openExpandedProfilePanelForUserId,
    openExtendedProfileModalForUserId:
      profiles.openExtendedProfileModalForUserId,
    openGroupOverviewPanel: extras.groupDmActions.openGroupOverviewPanel,
    openGroupSettingsFromHeader:
      extras.groupDmActions.openGroupSettingsFromHeader,
  });
}

function wireProfileSurfaceAdapter(
  phase2: Phase2,
  extras: UseAppLayoutMessagingSurfaceAdaptersExtras,
  derived: ReturnType<typeof wireFriendshipAndHideDm>,
) {
  const { profiles } = extras;
  return useProfileSurfaceAdapter({
    currentUserId: computed(() => phase2.currentUserComputed.value?.id),
    expandedProfile: useComputedRefAlias(phase2.expandedProfile),
    expandedProfileNote: useComputedRefAlias(profiles.expandedProfileNote),
    expandedProfileLoading: useComputedRefAlias(
      profiles.expandedProfileLoading,
    ),
    isExpandedProfileSidePanel: useComputedRefAlias(
      phase2.isExpandedProfileSidePanel,
    ),
    isExpandedProfileModalOpen: useComputedRefAlias(
      phase2.isExpandedProfileModalOpen,
    ),
    isExpandedProfileTargetBlocked: useComputedRefAlias(
      profiles.isExpandedProfileTargetBlocked,
    ),
    friendshipKnown: useComputedRefAlias(derived.friendshipKnownComputed),
    friendIds: computed(() => phase2.workspace.friendIds.value),
    friendIdsByUserId: computed(() => phase2.workspace.friendIdsByUserId.value),
    friendRequestsIncoming: computed(
      () => phase2.workspace.friendRequestsIncoming.value ?? [],
    ),
    friendRequestsOutgoing: computed(
      () => phase2.workspace.friendRequestsOutgoing.value ?? [],
    ),
    blockedUserIds: computed(() => phase2.workspace.blockedUserIds.value ?? []),
    guestFriendsLocked: useComputedRefAlias(phase2.guestFriendsLocked),
    presenceMobileByUserId: useComputedOptionalRefAlias(
      phase2.presenceMobileByUserId,
    ),
    hideOpenDmButton: useComputedRefAlias(
      derived.expandedProfileHideOpenDmButtonComputed,
    ),
    onUpdateExpandedProfileNote: (note: string) => {
      const id =
        phase2.expandedProfileTargetUserId.value?.trim() ??
        phase2.expandedProfile.value?.id ??
        null;
      if (id) profiles.updateProfileNote(id, note);
    },
    onExpandedProfileModalUpdate: profiles.onExpandedProfileModalUpdate,
    handleExpandedProfileOpenServer: extras.handleExpandedProfileOpenServer,
    handleExpandedProfileOpenProfile: profiles.handleExpandedProfileOpenProfile,
    expandDmProfileToFullModal: profiles.expandDmProfileToFullModal,
    handleExpandedProfileOpenDM: (userId: string) => {
      profiles.handleExpandedProfileOpenDM(
        userId,
        phase2.selectDmUser,
        phase2.selectDMTab,
      );
    },
    handleExpandedProfileSendFriendRequest: (userId: string) => {
      void phase2.sendFriendRequest(userId);
    },
    handleExpandedProfileCancelOutgoingFriendRequest:
      profiles.handleExpandedProfileCancelOutgoingFriendRequest,
    handleExpandedProfileAcceptIncomingFriendRequest:
      profiles.handleExpandedProfileAcceptIncomingFriendRequest,
    handleExpandedProfileDeclineIncomingFriendRequest:
      profiles.handleExpandedProfileDeclineIncomingFriendRequest,
    handleExpandedProfileRemoveFriend:
      profiles.handleExpandedProfileRemoveFriend,
    handleProfileBlockUser: profiles.handleProfileBlockUser,
    handleProfileUnblockUser: profiles.handleProfileUnblockUser,
    handleProfileReportUser: profiles.handleProfileReportUser,
  });
}

function watchSelectedServerMembers(phase2: Phase2) {
  const { fetchMembersForServer } = createEchoServerMemberOrchestration({
    authSession: phase2.authSession,
    echoSession: phase2.echoSession,
    selectedServerId: phase2.selectedServerIdRef,
  });
  watch(
    phase2.selectedServerIdRef,
    (sid) => {
      if (sid && sid !== 'echo') {
        void fetchMembersForServer(sid);
      }
    },
    { immediate: true },
  );
}

/**
 * DM / profile / chat-header region adapters + selected-server member fetch.
 */
export function useAppLayoutMessagingSurfaceAdapters(
  phase2: Phase2,
  extras: UseAppLayoutMessagingSurfaceAdaptersExtras,
) {
  const derived = wireFriendshipAndHideDm(phase2, extras.profiles);
  const dmSurfaceAdapter = wireDmSurfaceAdapter(phase2, extras);
  const profileSurfaceAdapter = wireProfileSurfaceAdapter(
    phase2,
    extras,
    derived,
  );
  watchSelectedServerMembers(phase2);
  return {
    dmSurfaceAdapter,
    profileSurfaceAdapter,
    chatHeaderAdapter: useChatHeaderAdapter({
      dmSurface: dmSurfaceAdapter,
      profileSurface: profileSurfaceAdapter,
    }),
  };
}
