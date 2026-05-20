<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  inject,
  onMounted,
  onUnmounted,
  unref,
} from 'vue';
import type { MaybeRef } from 'vue';
import { LAYOUT_MODALS_KEY } from '@/features/layout/layoutInjectionKeys';
import {
  MODALS_INJECT_KEYS,
  type AppLayoutModalsProps,
} from '@/features/layout/appLayoutModalsProps';
import type { ProfileSurfaceAdapter } from '@/features/layout/regionAdapters';
import {
  isGuildMemberProfileContext,
  type MemberProfile,
} from '@/utils/memberProfiles';

const AddServerModal = defineAsyncComponent(
  () => import('@/components/AddServerModal.vue'),
);
const InviteUsersModal = defineAsyncComponent(
  () => import('@/components/InviteUsersModal.vue'),
);
const ServerSettingsModal = defineAsyncComponent(
  () => import('@/components/ServerSettingsModal.vue'),
);
const GroupDMSettingsModal = defineAsyncComponent(
  () => import('@/components/GroupDMSettingsModal.vue'),
);
const GroupDMCreateModal = defineAsyncComponent(
  () => import('@/components/GroupDMCreateModal.vue'),
);
const SettingsModal = defineAsyncComponent(
  () => import('@/components/SettingsModal.vue'),
);
const MemberProfilePopout = defineAsyncComponent(
  () => import('@/components/MemberProfilePopout.vue'),
);
const SelfProfilePopout = defineAsyncComponent(
  () => import('@/components/SelfProfilePopout.vue'),
);
const ExpandedProfileModal = defineAsyncComponent(
  () => import('@/components/ExpandedProfileModal.vue'),
);
const LoginRegisterModal = defineAsyncComponent(
  () => import('@/components/LoginRegisterModal.vue'),
);
const ModerationActionModal = defineAsyncComponent(
  () => import('@/components/ModerationActionModal.vue'),
);
const LeaveServerConfirmModal = defineAsyncComponent(
  () => import('@/components/LeaveServerConfirmModal.vue'),
);
const JoinServerConfirmModal = defineAsyncComponent(
  () => import('@/components/JoinServerConfirmModal.vue'),
);
const ServerApplicationModal = defineAsyncComponent(
  () => import('@/components/ServerApplicationModal.vue'),
);

const props = defineProps<Partial<AppLayoutModalsProps>>();

const layoutModals = inject(LAYOUT_MODALS_KEY, null);

const m = computed(() => {
  const inj = layoutModals;
  const o: Record<string, unknown> = {};
  for (const key of MODALS_INJECT_KEYS) {
    const k = key as keyof AppLayoutModalsProps;
    if (inj && inj[k] !== undefined) {
      o[k as string] = unref(
        inj[k] as MaybeRef<AppLayoutModalsProps[typeof k]>,
      );
    } else {
      o[k as string] = props[k];
    }
  }
  return o as any;
});

const profileSurfaceAdapter = computed<ProfileSurfaceAdapter | null>(
  () => (m.value.profileSurfaceAdapter as ProfileSurfaceAdapter | null) ?? null,
);

const expandedProfileModel = computed(
  () =>
    profileSurfaceAdapter.value?.model.value ?? {
      currentUserId: m.value.currentUser?.id,
      expandedProfile: m.value.expandedProfile,
      expandedProfileNote: m.value.expandedProfileNote,
      isExpandedProfileSidePanel: !!m.value.isExpandedProfileSidePanel,
      isExpandedProfileModalOpen: !!m.value.isExpandedProfileModalOpen,
      isExpandedProfileTargetBlocked: !!m.value.isExpandedProfileTargetBlocked,
      friendshipKnown: !!m.value.friendshipKnown,
      friendIds: m.value.friendIds ?? [],
      friendIdsByUserId: m.value.friendIdsByUserId ?? {},
      friendRequestsIncoming: m.value.friendRequestsIncoming ?? [],
      friendRequestsOutgoing: m.value.friendRequestsOutgoing ?? [],
      blockedUserIds: m.value.blockedUserIds ?? [],
      guestFriendsLocked: !!m.value.guestFriendsLocked,
      presenceByUserId: m.value.expandedProfilePresenceByUserId ?? {},
      presenceMobileByUserId:
        m.value.expandedProfilePresenceMobileByUserId ?? {},
      hideOpenDmButton: !!m.value.expandedProfileHideOpenDmButton,
    },
);

/** Guild role chips + Add role: only for profiles built in a real server (not DM/home). */
const hideGuildRolesInMemberPopout = computed(() => {
  const p = m.value.activeMemberProfile as MemberProfile | null | undefined;
  if (!p) return true;
  return !isGuildMemberProfileContext(p.serverName);
});

const expandedProfileIntents = computed(
  () =>
    profileSurfaceAdapter.value?.intents ?? {
      updateNote: m.value.onUpdateExpandedProfileNote,
      setModalOpen: m.value.onExpandedProfileModalUpdate,
      openServer: m.value.onExpandedProfileOpenServer,
      openProfile: m.value.onExpandedProfileOpenProfile,
      expandProfileModal: () => {},
      openDm: m.value.onExpandedProfileOpenDm,
      sendFriendRequest: m.value.onExpandedProfileSendFriendRequest,
      cancelOutgoingFriendRequest:
        m.value.onExpandedProfileCancelOutgoingFriendRequest,
      acceptIncomingFriendRequest:
        m.value.onExpandedProfileAcceptIncomingFriendRequest,
      declineIncomingFriendRequest:
        m.value.onExpandedProfileDeclineIncomingFriendRequest,
      removeFriend: m.value.onExpandedProfileRemoveFriend,
      blockUser: m.value.onProfileBlockUser,
      unblockUser: m.value.onProfileUnblockUser,
      reportUser: m.value.onProfileReportUser,
    },
);

function warmCommonModalChunks(): void {
  void Promise.allSettled([
    import('@/components/SettingsModal.vue'),
    import('@/components/SelfProfilePopout.vue'),
    import('@/components/MemberProfilePopout.vue'),
    import('@/components/ServerSettingsModal.vue'),
  ]);
}

onMounted(() => {
  if (typeof window === 'undefined') return;
  if (typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(
      () => {
        warmCommonModalChunks();
      },
      { timeout: 3000 },
    );
    onUnmounted(() => {
      window.cancelIdleCallback?.(idleId);
    });
    return;
  }
  const timerId = window.setTimeout(() => {
    warmCommonModalChunks();
  }, 1200);
  onUnmounted(() => {
    window.clearTimeout(timerId);
  });
});
</script>

<template>
  <LoginRegisterModal
    v-if="m.isAuthModalOpen"
    :model-value="m.isAuthModalOpen"
    :initial-login-entry="m.authModalInitialLoginEntry ?? 'social'"
    :passkey-on-open="m.authModalPasskeyOnOpen ?? false"
    :initial-tab="m.authModalInitialTab ?? 'login'"
    :initial-auth-sub-view="m.authModalInitialSubView ?? null"
    @update:model-value="m.onUpdateAuthModal"
  />
  <AddServerModal
    v-if="m.isAddServerModalOpen"
    :key="m.addServerInitialView"
    :model-value="m.isAddServerModalOpen"
    :initial-view="m.addServerInitialView"
    :can-import-discord="m.canImportDiscord ?? false"
    :discoverable-servers="m.discoverableServers"
    :join-error="m.addServerJoinError ?? ''"
    :create-busy="m.addServerCreateBusy ?? false"
    @update:model-value="m.onUpdateAddServerModal"
    @request-discord-link="() => void m.onRequestDiscordLinkFromAddServer?.()"
    @server-created="m.onCreateServer"
    @join-discoverable="m.onJoinDiscoverableServer"
    @join-with-invite-link="m.onJoinWithInviteLink"
  />
  <InviteUsersModal
    v-if="m.isInviteModalOpen"
    :model-value="m.isInviteModalOpen"
    :server-name="m.selectedServerName"
    :invite-link="m.inviteLink"
    :invite-link-lookup-pending="m.inviteLinkLookupPending ?? false"
    :invite-voice-channel-id="m.inviteModalVoiceChannelId ?? null"
    :invite-voice-channel-name="m.inviteModalVoiceChannelName ?? null"
    :applications-enabled="m.inviteApplicationsEnabled ?? false"
    :invite-join-links-enabled="m.inviteJoinLinksEnabled ?? true"
    :can-create-direct-invite="m.inviteCanCreateDirectHexInvite ?? false"
    :direct-invite-link="m.inviteDirectHexInviteLink ?? ''"
    :direct-invite-busy="m.inviteDirectHexInviteBusy ?? false"
    :friends="m.inviteableFriends"
    @update:model-value="m.onUpdateInviteModal"
    @invite="m.onInviteFriend"
    @create-direct-invite="() => void m.onCreateInviteDirectHex?.()"
  />
  <ServerSettingsModal
    v-if="m.isServerSettingsModalOpen"
    :model-value="m.isServerSettingsModalOpen"
    :server="m.selectedServerForSettings"
    :users="m.serverSettingsMemberUsers"
    :resolve-member-highest-role="m.resolveMemberHighestRole"
    :can-moderate-member-action="m.canModerateMemberAction"
    :on-request-moderate-member="m.onRequestModerateMember"
    :can-manage-roles="m.serverSettingsCanManageRoles ?? true"
    :can-manage-server="m.serverSettingsCanManageServer ?? true"
    :delete-server-enabled="m.deleteServerEnabled ?? false"
    :initial-section="m.serverSettingsModalInitialSection ?? null"
    @update:model-value="m.onUpdateServerSettingsModal"
    @update:active-section="
      m.onUpdateServerSettingsModalActiveSection?.($event)
    "
    @echo-workspace-refresh="m.onEchoWorkspaceRefresh?.()"
    @echo-role-catalog-refresh="m.onEchoRoleCatalogRefresh?.()"
    @server-deleted="m.onServerDeleted?.($event)"
    @preview-role="m.onPreviewRoleFromSettings?.($event)"
    :guild-structure-enabled="m.serverSettingsGuildStructureEnabled ?? false"
    :structure-categories="m.serverSettingsStructureCategories ?? []"
    :reorder-channel="m.serverSettingsOnChannelReorder"
    :reorder-category="m.serverSettingsOnCategoryReorder"
    :is-discord-imported-server="
      m.serverSettingsIsDiscordImportedServer ?? false
    "
  />
  <GroupDMSettingsModal
    v-if="m.isGroupDmSettingsOpen"
    :model-value="m.isGroupDmSettingsOpen"
    :group-id="m.groupSettingsId"
    :name="m.groupSettingsName"
    :pfp="m.groupSettingsPfp"
    :members="m.groupSettingsMembers"
    :current-user-id="m.currentUser?.id"
    :initial-focus="m.groupDmSettingsInitialFocus ?? null"
    @update:model-value="m.onUpdateGroupDmSettingsOpen"
    @update-group="m.onUpdateGroupFromSettings"
    @remove-member="m.onRemoveGroupDmMember"
    @leave-group="m.onLeaveGroupDm"
    @add-members="m.onOpenAddMembersToGroupDm"
  />
  <GroupDMCreateModal
    v-if="m.isGroupDmModalOpen"
    :model-value="m.isGroupDmModalOpen"
    :friends="m.dmGroupFriends"
    :preselected-ids="m.groupDmPreselectedIds"
    :locked-ids="m.groupDmLockedIds"
    :max-group-members="m.groupDmMaxMembers"
    @update:model-value="m.onUpdateGroupDmModal"
    @create-group="m.onCreateGroupDm"
  />
  <SettingsModal
    v-if="m.isSettingsModalOpen"
    :model-value="m.isSettingsModalOpen"
    :current-user="m.currentUser"
    :initial-section="m.settingsModalInitialSection"
    @update:model-value="m.onUpdateSettingsModal"
    @update:active-section="m.onUpdateSettingsModalActiveSection?.($event)"
    @guest-upgraded="() => void m.onSettingsGuestUpgraded?.()"
    @guest-sign-in-existing="() => m.onSettingsGuestSignInExisting?.()"
  />
  <MemberProfilePopout
    v-if="m.isMemberPopoutOpen"
    :model-value="m.isMemberPopoutOpen"
    :profile="m.activeMemberProfile"
    :anchor="m.memberPopoutAnchor"
    :note="m.activeMemberNote"
    :open-roles-panel-with-profile="m.memberPopoutOpenRolesPanel ?? false"
    :current-user-id="m.currentUserIdForProfiles"
    :is-friend="m.isMemberPopoutFriend ?? false"
    :can-send-friend-request="m.isMemberPopoutCanSendFriendRequest ?? false"
    :is-target-blocked="m.isMemberPopoutTargetBlocked"
    @update:model-value="m.onUpdateMemberPopoutOpen"
    @update:note="m.onUpdateMemberNote"
    @open-full-profile="m.onOpenExpandedProfileFromMemberPopout"
    @block-user="m.onProfileBlockUser($event)"
    @unblock-user="m.onProfileUnblockUser($event)"
    @remove-friend="m.onExpandedProfileRemoveFriend($event)"
    @send-friend-request="m.onMemberPopoutSendFriendRequest?.($event)"
    @report-user="m.onProfileReportUser($event)"
    @quick-dm="
      (text) => {
        const id = m.activeMemberProfile?.id;
        if (id) void m.onMemberPopoutQuickDm?.({ userId: id, text });
      }
    "
    @open-dm="(userId) => m.onMemberPopoutOpenDm?.(userId)"
    :role-management="m.memberListRoleManagement"
    :hide-guild-roles-section="hideGuildRolesInMemberPopout"
  />
  <SelfProfilePopout
    v-if="m.isSelfProfilePopoutOpen"
    :model-value="m.isSelfProfilePopoutOpen"
    :profile="m.selfProfile"
    :anchor="m.selfProfileAnchor"
    :custom-status="m.customStatus"
    @update:model-value="m.onUpdateSelfProfilePopoutOpen"
    @update:custom-status="m.onUpdateCustomStatus"
    @update:status="m.onUpdateCurrentUserStatus"
    @open-full-profile="m.onOpenExpandedProfileFromSelfPopout"
    @open-settings="m.onOpenSettingsFromProfileBar()"
  />
  <ExpandedProfileModal
    v-if="
      !expandedProfileModel.isExpandedProfileSidePanel &&
      expandedProfileModel.isExpandedProfileModalOpen
    "
    :model-value="expandedProfileModel.isExpandedProfileModalOpen"
    :profile="expandedProfileModel.expandedProfile"
    :current-user-id="expandedProfileModel.currentUserId"
    :friendship-known="expandedProfileModel.friendshipKnown"
    :is-target-blocked="expandedProfileModel.isExpandedProfileTargetBlocked"
    :guest-friends-locked="expandedProfileModel.guestFriendsLocked"
    :hide-open-dm-button="expandedProfileModel.hideOpenDmButton"
    :friend-ids="expandedProfileModel.friendIds"
    :friend-ids-by-user-id="expandedProfileModel.friendIdsByUserId"
    :friend-requests-incoming="expandedProfileModel.friendRequestsIncoming"
    :friend-requests-outgoing="expandedProfileModel.friendRequestsOutgoing"
    :blocked-user-ids="expandedProfileModel.blockedUserIds"
    :presence-by-user-id="expandedProfileModel.presenceByUserId ?? {}"
    :presence-mobile-by-user-id="
      expandedProfileModel.presenceMobileByUserId ?? {}
    "
    :note="expandedProfileModel.expandedProfileNote"
    @update:note="expandedProfileIntents.updateNote"
    @update:model-value="expandedProfileIntents.setModalOpen"
    @open-edit-profile="m.onOpenEditProfileFromExpandedProfile?.()"
    @open-server="expandedProfileIntents.openServer"
    @open-profile="expandedProfileIntents.openProfile"
    @open-dm="expandedProfileIntents.openDm"
    @send-friend-request="expandedProfileIntents.sendFriendRequest"
    @cancel-outgoing-friend-request="
      expandedProfileIntents.cancelOutgoingFriendRequest
    "
    @accept-incoming-friend-request="
      expandedProfileIntents.acceptIncomingFriendRequest?.($event)
    "
    @decline-incoming-friend-request="
      expandedProfileIntents.declineIncomingFriendRequest?.($event)
    "
    @remove-friend="expandedProfileIntents.removeFriend"
    @block-user="expandedProfileIntents.blockUser($event)"
    @unblock-user="expandedProfileIntents.unblockUser($event)"
    @report-user="expandedProfileIntents.reportUser($event)"
  />

  <ModerationActionModal
    v-if="m.moderationModalOpen"
    :model-value="m.moderationModalOpen"
    :action="m.moderationAction"
    :target-user-name="m.moderationTargetUser?.name ?? 'Member'"
    :target-user-pfp="m.moderationTargetUser?.pfp"
    :server-name="m.moderationServerName"
    :can-delete-recent-messages="m.moderationCanPurgeBanMessages === true"
    @update:model-value="m.onUpdateModerationModalOpen"
    @confirm="m.onModerationModalConfirm"
  />

  <LeaveServerConfirmModal
    v-if="m.isLeaveServerModalOpen"
    :model-value="m.isLeaveServerModalOpen"
    :variant="m.leaveServerModalVariant"
    :server-name="m.leaveServerModalServerName"
    @update:model-value="m.onUpdateLeaveServerModal"
    @confirm="m.onLeaveServerModalConfirm"
  />

  <JoinServerConfirmModal
    v-if="m.isJoinServerConfirmModalOpen"
    :model-value="m.isJoinServerConfirmModalOpen"
    :server-name="m.joinServerConfirmPreview?.serverName ?? 'Server'"
    :icon-url="m.joinServerConfirmPreview?.iconUrl"
    :banner-url="m.joinServerConfirmPreview?.bannerUrl"
    :description="m.joinServerConfirmPreview?.description"
    :member-count="m.joinServerConfirmPreview?.memberCount"
    :subtitle="m.joinServerConfirmPreview?.subtitle"
    :is-voice-invite="m.joinServerConfirmPreview?.isVoiceInvite === true"
    :voice-participant-count="m.joinServerConfirmPreview?.voiceParticipantCount"
    :top-members="m.joinServerConfirmPreview?.topMembers"
    :busy="m.joinServerConfirmBusy === true"
    @update:model-value="m.onUpdateJoinServerConfirmModal"
    @confirm="m.onJoinServerConfirmModalConfirm"
  />

  <ServerApplicationModal
    v-if="m.isServerApplicationModalOpen"
    :model-value="m.isServerApplicationModalOpen"
    :payload="m.serverApplicationPayload"
    :busy="m.serverApplicationBusy === true"
    @update:model-value="m.onUpdateServerApplicationModal"
    @submitted="m.onServerApplicationModalSubmitted"
  />
</template>
