import { computed, watch, type Ref } from 'vue';
import { isGuildShellSettling as computeGuildShellSettling } from '../shell/guildShellSettling';
import { useImmediateShellSwitchPending } from '../shell/useImmediateShellSwitchPending';
import { useComputedOptionalRefAlias } from './useComputedOptionalRefAlias';
import { useAppLayoutShellAuthDerived } from '../shell/useAppLayoutShellAuthDerived';
import { useEchoGuildRoleUi } from '../server/useEchoGuildRoleUi';
import { useSelectedServerInvite } from '../server/useSelectedServerInvite';
import { createEchoCanContextComputeds } from './createEchoCanContextComputeds';
import { createMemberListHighestRoleResolver } from '../members/useMemberListHighestRoleResolver';
import { useEchoRolePreviewStateComputed } from '../members/useEchoRolePreviewStateComputed';
import { useGuildChannelTree } from '@/features/layout/composables/server/useGuildChannelTree';
import { createIsChannelActive } from '../shell/createIsChannelActive';
import { bindResolveServerChannelInfoForMainSurface } from '@/features/layout/resolveServerChannelTypeForMainSurface';
import type { AppLayoutDmAndShellSession } from './useAppLayoutDmAndShellSession';

function wireInviteAndAuth(session: AppLayoutDmAndShellSession) {
  const { uiState, serverStore, workspace, authSession } = session;
  const selectedServerInvite = useSelectedServerInvite({
    serverStore,
    workspace,
    authSession,
    isInviteModalOpen: uiState.isInviteModalOpen,
    inviteVoiceChannelId: uiState.inviteModalVoiceChannelId,
  });
  const selectedServerEcho = useComputedOptionalRefAlias(
    session.selectedServerRef,
  );
  const authDerived = useAppLayoutShellAuthDerived({
    backendUser: () => authSession.backendUser,
    planLimits: () => authSession.planLimits,
    livePresenceByUserId: session.presenceByUserId,
    selectedServer: selectedServerEcho,
    workspaceMembersByServer: session.workspaceMembersByServer,
  });
  watch(
    () =>
      [
        session.authStateGeneration.value,
        authSession.backendUser?.id ?? '',
        authSession.backendUser?.customStatus ?? '',
      ] as const,
    () => {
      const u = authSession.backendUser;
      if (!u) {
        uiState.customStatus.value = '';
        return;
      }
      uiState.customStatus.value =
        u.customStatus !== undefined && u.customStatus !== null
          ? String(u.customStatus)
          : '';
    },
    { immediate: true },
  );
  return {
    selectedServerInvite,
    selectedServerEcho,
    selectedServerView: session.selectedServerRef,
    ...authDerived,
  };
}

function wireRolesAndChannelTree(
  session: AppLayoutDmAndShellSession,
  inviteAuth: ReturnType<typeof wireInviteAndAuth>,
) {
  const roleUi = useEchoGuildRoleUi({
    serverStore: session.serverStore,
    authSession: session.authSession,
    workspace: session.workspace,
    currentUser: inviteAuth.currentUser,
    selectedServer: inviteAuth.selectedServerEcho,
  });
  const inviteApplicationsEnabled = computed(() => {
    const s = inviteAuth.selectedServerInvite.selectedServer.value;
    return !!s && s.id !== 'echo' && s.applicationsEnabled === true;
  });
  const inviteJoinLinksEnabled = computed(() => {
    const s = inviteAuth.selectedServerInvite.selectedServer.value;
    if (!s || s.id === 'echo') return true;
    return s.inviteJoinEnabled !== false;
  });
  const rolePreviewState = useEchoRolePreviewStateComputed(
    roleUi.rolePreview as Ref<unknown>,
  );
  const channelTree = useGuildChannelTree({
    serverStore: session.serverStore,
    workspace: session.workspace,
    selectedServer: inviteAuth.selectedServerEcho,
    rolePreview: rolePreviewState,
    isRolePreviewActiveForServer: roleUi.isRolePreviewActiveForServer,
    previewHasUiPermission: roleUi.previewHasUiPermission,
  });
  return {
    roleUi,
    inviteApplicationsEnabled,
    inviteJoinLinksEnabled,
    inviteCanCreateDirectHexInvite: computed(
      () =>
        inviteApplicationsEnabled.value &&
        inviteJoinLinksEnabled.value &&
        roleUi.serverSettingsCanManageServer.value,
    ),
    echoCanContext: createEchoCanContextComputeds(roleUi),
    rolePreviewState,
    resolveMemberHighestRole: createMemberListHighestRoleResolver({
      memberListResolveHighestRole: roleUi.memberListResolveHighestRole,
      selectedServerId: session.selectedServerIdRef,
    }),
    channelTree,
    ...channelTree,
    getServerChannelInfoForMainSurface:
      bindResolveServerChannelInfoForMainSurface(
        channelTree.findChannelContextById,
      ),
  };
}

/**
 * Invite links, shell auth, guild roles, and channel tree. Call after session.
 */
export function useAppLayoutDmAndShellRolesTree(
  session: AppLayoutDmAndShellSession,
) {
  const { uiState, workspace, serverStore } = session;
  const isChannelActive = createIsChannelActive(uiState.activeChannelId);
  const isGuildShellSettledForSwitchPending = computed(
    () =>
      !computeGuildShellSettling({
        rail: uiState.activeRailTab.value,
        selectedServerId: serverStore.selectedServerId,
        activeChannelId: uiState.activeChannelId.value,
        categoriesByServer: workspace.categoriesByServer.value,
        workspaceLoading: workspace.loading.value,
        workspaceFromApi: workspace.fromApi.value,
        initialLoadInFlight: workspace.initialLoadInFlight.value,
      }),
  );
  const { immediateShellSwitchPending } = useImmediateShellSwitchPending({
    activeRailTab: uiState.activeRailTab,
    selectedServerId: session.selectedServerIdRef,
    clearWhen: isGuildShellSettledForSwitchPending,
  });
  const inviteAuth = wireInviteAndAuth(session);
  const rolesTree = wireRolesAndChannelTree(session, inviteAuth);
  return {
    isChannelActive,
    isGuildShellSettledForSwitchPending,
    immediateShellSwitchPending,
    ...inviteAuth,
    ...rolesTree,
  };
}

export type AppLayoutDmAndShellRolesTree = ReturnType<
  typeof useAppLayoutDmAndShellRolesTree
>;
