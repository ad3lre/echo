import { computed, type ComputedRef, type Ref } from 'vue';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import type { useServerStore } from '@/features/layout/server';
import { useAppLayoutGroupDm } from './useAppLayoutGroupDm';
import { createBeforeOpenGroupDmModal } from './createBeforeOpenGroupDmModal';
import { peerDisplayNamePlaceholder } from '@/features/dm/peerDisplayPlaceholder';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import {
  dispatchAppToast,
  dispatchAppToastDetail,
} from '@/features/layout/failures/controllerMissingAction';
import { reportPrimaryFlowFailure } from '@/features/layout/failures/primaryFlowFailure';
import {
  deleteEchoGroupDmMember,
  fetchEchoDmThreads,
  patchEchoGroupDm,
  postEchoAddGroupDmMembers,
  postEchoLeaveGroupDm,
} from '@/api/echoClient';

type GroupDmOptions = Parameters<typeof useAppLayoutGroupDm>[0];
/** Fields forwarded verbatim to `useAppLayoutGroupDm`; server-call closures + the
 * pre-open hook are built inside this composable, and users/messages come from
 * the workspace dep. */
type ForwardedGroupDmDeps = Omit<
  GroupDmOptions,
  | 'addMembersToGroupDmOnServer'
  | 'persistGroupDmSettings'
  | 'beforeOpenGroupDmModal'
  | 'users'
  | 'messages'
>;

/**
 * Group-DM management for the layout shell: wraps `useAppLayoutGroupDm` with its
 * server-call closures (add members / persist settings), the guest-guarded
 * select handler, the settings-panel member projection, and the kick/leave
 * handlers (mock + live branches). The controller keeps the forward-declared
 * `selectGroupDmForIncomingRail` / `navigateToDmForAnswerRef` late-binds.
 */
export function useAppLayoutGroupDmManagement(
  deps: ForwardedGroupDmDeps & {
    workspace: WorkspaceStateApi;
    currentUser: ComputedRef<{ id: string } | null | undefined>;
    authSession: ReturnType<typeof useAuthSessionStore>;
    serverStore: ReturnType<typeof useServerStore>;
    mergeEchoDmThreadsFromApi: (
      threads: Awaited<ReturnType<typeof fetchEchoDmThreads>>['threads'],
    ) => void;
    openGuestUpgradeModal: () => void;
    closePinsDropdown: () => void;
    clearSearch: () => void;
  },
) {
  const {
    groupDMs,
    groupDMPreselectedIds,
    groupDMLockedIds,
    isGroupDMModalOpen,
    isGroupDMSettingsOpen,
    groupDmSettingsInitialFocus,
    activeGroupSettingsId,
    activeChannelId,
    selectedDMUserId,
    dmActiveTab,
    selectedMessageRequestId,
    isDMPanelOpen,
    pfpBarExpanded,
    currentUserId,
    dmPartnerUserId,
    activeGroupId,
    selectServer,
    isInDMChat,
    isGroupOverviewOpen,
    isExpandedProfileModalOpen,
    isExpandedProfileSidePanel,
    expandedProfile,
    expandedProfileTargetUserId,
    openGroupDmOnServer,
    isCompactShell,
    workspace,
    currentUser,
    authSession,
    serverStore,
    mergeEchoDmThreadsFromApi,
    openGuestUpgradeModal,
    closePinsDropdown,
    clearSearch,
  } = deps;

  const beforeOpenGroupDmModal = createBeforeOpenGroupDmModal({
    closePinsDropdown,
    clearSearch,
  });

  const groupDmActions = useAppLayoutGroupDm({
    groupDMs,
    groupDMPreselectedIds,
    groupDMLockedIds,
    isGroupDMModalOpen,
    isGroupDMSettingsOpen,
    groupDmSettingsInitialFocus,
    activeGroupSettingsId,
    activeChannelId,
    selectedDMUserId,
    dmActiveTab,
    selectedMessageRequestId,
    isDMPanelOpen,
    pfpBarExpanded,
    currentUserId,
    dmPartnerUserId,
    activeGroupId,
    users: workspace.users as unknown as Ref<
      Array<{ id: string; pfp: string }>
    >,
    messages: workspace.messages,
    selectServer,
    isInDMChat,
    isGroupOverviewOpen,
    isExpandedProfileModalOpen,
    isExpandedProfileSidePanel,
    expandedProfile,
    expandedProfileTargetUserId,
    openGroupDmOnServer,
    addMembersToGroupDmOnServer: async ({ channelId, memberUserIds }) => {
      if (!authSession.isAuthenticated) {
        dispatchAppToast('Sign in to add group members.', 'info');
        throw new Error('not_authenticated');
      }
      const token = authSession.accessToken?.trim() ?? '';
      try {
        await postEchoAddGroupDmMembers(token, channelId, { memberUserIds });
        const { threads } = await fetchEchoDmThreads(token);
        mergeEchoDmThreadsFromApi(threads);
      } catch (e) {
        reportPrimaryFlowFailure('group_dm.add_members', e, {
          channelId,
          memberCount: memberUserIds.length,
        });
        dispatchAppToastDetail({
          message: 'Could not add one or more members to the group.',
          severity: 'warning',
        });
        throw e;
      }
    },
    persistGroupDmSettings: async ({ channelId, name, pfp }) => {
      if (!authSession.isAuthenticated) {
        dispatchAppToast('Sign in to update group settings.', 'info');
        throw new Error('not_authenticated');
      }
      const token = authSession.accessToken?.trim() ?? '';
      try {
        await patchEchoGroupDm(token, channelId, { name, pfp });
        const { threads } = await fetchEchoDmThreads(token);
        mergeEchoDmThreadsFromApi(threads);
      } catch (e) {
        reportPrimaryFlowFailure('group_dm.update_settings', e, {
          channelId,
        });
        dispatchAppToastDetail({
          message: 'Could not save group settings.',
          severity: 'warning',
        });
        throw e;
      }
    },
    beforeOpenGroupDmModal,
    isCompactShell,
  });

  function handleSelectGroupDMWithGuestGuard(groupId: string) {
    if (authSession.backendUser?.isGuest === true) {
      openGuestUpgradeModal();
      return;
    }
    groupDmActions.handleSelectGroupDM(groupId);
  }

  const groupSettingsMembers = computed(() => {
    const groupId = activeGroupSettingsId.value?.trim();
    const group = groupId ? groupDMs.value[groupId] : null;
    if (!group) return [];
    const usersById = new Map(workspace.users.value.map((u) => [u.id, u]));
    return group.memberIds.map((id) => {
      const u = usersById.get(id);
      return {
        id,
        name: u?.name ?? peerDisplayNamePlaceholder(id),
        pfp: u?.pfp ?? '',
      };
    });
  });
  const groupSettingsId = computed(() => activeGroupSettingsId.value ?? '');

  function onOpenAddMembersToGroupDm() {
    const groupId = activeGroupSettingsId.value?.trim();
    const group = groupId ? groupDMs.value[groupId] : null;
    if (!group) return;
    const withoutSelf = group.memberIds.filter(
      (id) => id !== currentUser.value?.id,
    );
    groupDmActions.openGroupDMModal({
      targetGroupId: groupId,
      preselectedIds: withoutSelf,
      lockedIds: withoutSelf,
    });
  }

  async function handleKickGroupDmMember(payload: {
    groupId: string;
    userId: string;
  }) {
    const gid = payload.groupId?.trim();
    const uid = payload.userId?.trim();
    if (!gid || !uid) return;
    const self = currentUserId.value?.trim();
    if (self && uid === self) return;

    if (echoSyncCapabilities.isMockDataMode) {
      const g = groupDMs.value[gid];
      if (!g) return;
      groupDMs.value = {
        ...groupDMs.value,
        [gid]: {
          ...g,
          memberIds: g.memberIds.filter((id) => id !== uid),
        },
      };
      return;
    }

    if (!authSession.isAuthenticated) return;

    try {
      await deleteEchoGroupDmMember(
        authSession.accessToken?.trim() ?? '',
        gid,
        uid,
      );
      const { threads } = await fetchEchoDmThreads(
        authSession.accessToken?.trim() ?? '',
      );
      mergeEchoDmThreadsFromApi(threads);
    } catch (e) {
      reportPrimaryFlowFailure('group_dm.kick_member', e, {
        groupId: gid,
        userId: uid,
      });
      dispatchAppToastDetail({
        message: 'Could not remove member from the group.',
        severity: 'warning',
      });
    }
  }

  async function handleLeaveGroupDm(payload: { groupId: string }) {
    const gid = payload.groupId?.trim();
    if (!gid) return;
    const self = currentUserId.value?.trim();

    if (echoSyncCapabilities.isMockDataMode) {
      const g = groupDMs.value[gid];
      if (g && self) {
        const nextMemberIds = g.memberIds.filter((id) => id !== self);
        if (nextMemberIds.length === 0) {
          const next = { ...groupDMs.value };
          delete next[gid];
          groupDMs.value = next;
        } else {
          groupDMs.value = {
            ...groupDMs.value,
            [gid]: { ...g, memberIds: nextMemberIds },
          };
        }
      }
      isGroupDMSettingsOpen.value = false;
      groupDmSettingsInitialFocus.value = null;
      activeGroupSettingsId.value = null;
      isGroupOverviewOpen.value = false;
      if (activeChannelId.value === gid) {
        activeChannelId.value = 'general';
        selectedDMUserId.value = null;
        serverStore.selectServer('echo');
      }
      return;
    }

    if (!authSession.isAuthenticated || !self) {
      dispatchAppToast('Sign in to manage group DMs.', 'info');
      return;
    }

    try {
      await postEchoLeaveGroupDm(authSession.accessToken?.trim() ?? '', gid);
      const { threads } = await fetchEchoDmThreads(
        authSession.accessToken?.trim() ?? '',
      );
      mergeEchoDmThreadsFromApi(threads);
      isGroupDMSettingsOpen.value = false;
      groupDmSettingsInitialFocus.value = null;
      activeGroupSettingsId.value = null;
      isGroupOverviewOpen.value = false;
      if (activeChannelId.value === gid) {
        activeChannelId.value = 'general';
        selectedDMUserId.value = null;
        serverStore.selectServer('echo');
      }
    } catch (e) {
      reportPrimaryFlowFailure('group_dm.leave', e, { groupId: gid });
      dispatchAppToastDetail({
        message: 'Could not leave the group.',
        severity: 'warning',
      });
    }
  }

  return {
    groupDmActions,
    handleSelectGroupDMWithGuestGuard,
    groupSettingsMembers,
    groupSettingsId,
    onOpenAddMembersToGroupDm,
    handleKickGroupDmMember,
    handleLeaveGroupDm,
  };
}
