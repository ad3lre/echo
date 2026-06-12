import { ref, type Ref } from 'vue';
import type { useServerStore } from '@/stores/server';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { EchoSessionStore } from '@/stores/echoSession';
import type { EchoDmThreadFromApi } from '@/api/echoClient';
import type { WorkspaceStateApi } from '@/composables/workspace/types';
import { patchFriendIdsByUserIdMap } from '@/services/domain/workspaceFriendIdsByUserId';
import {
  applyWorkspaceRosterUsersPipeline,
  removeWorkspaceRosterUserById,
} from '@/services/domain/workspaceRoster';
import { applyEchoWorkspaceRetargetAfterServerDeletion } from '@/services/orchestration/workspaceServerDeletionNav';
import { applyEchoWorkspaceShellResetOnAuthUserCleared } from '@/services/orchestration/workspaceShellResetOnLogout';
import {
  runEchoWorkspaceHydrateFromApi,
  runEchoWorkspaceSocialRefreshFromApi,
} from '@/services/orchestration/workspaceEchoHydrateFromApi';
import type { RailTab } from '@/features/layout/mainSurface';
import { dbgMemberList } from '@/utils/echoMemberListDebug';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import type { AuthUserPublic } from '@/api/authClient';

export type CreateEchoWorkspaceLifecycleControllerDeps = {
  serverStore: ReturnType<typeof useServerStore>;
  authSession: ReturnType<typeof useAuthSessionStore>;
  echoSession: EchoSessionStore;
  workspace: WorkspaceStateApi;
  activeChannelId: Ref<string>;
  activeRailTab: Ref<RailTab>;
  isServerSettingsModalOpen: Ref<boolean>;
  refreshEchoRoleData: () => Promise<void>;
  getFirstTextChannelId: (
    cats: { name: string; channels: { id: string; type: string }[] }[],
  ) => string;
  syncEchoPresenceFromApi?: () => void;
  mergeEchoDmThreadsFromApi?: (threads: EchoDmThreadFromApi[]) => void;
  mergeEchoBlockedFromApi?: (blockedUserIds: string[]) => void;
  dmCallWithUserId?: Ref<string | null>;
  echoDmThreadIds?: Ref<Set<string>>;
};

export function createEchoWorkspaceLifecycleController(
  deps: CreateEchoWorkspaceLifecycleControllerDeps,
) {
  const {
    serverStore,
    authSession,
    echoSession,
    workspace,
    activeChannelId,
    activeRailTab,
    isServerSettingsModalOpen,
    refreshEchoRoleData,
    getFirstTextChannelId,
    syncEchoPresenceFromApi,
    mergeEchoDmThreadsFromApi,
    mergeEchoBlockedFromApi,
    dmCallWithUserId,
    echoDmThreadIds,
  } = deps;

  const echoWorkspaceError = ref<string | null>(null);
  let echoWorkspaceErrorAutoDismissTimer: ReturnType<typeof setTimeout> | null =
    null;
  const ECHO_WORKSPACE_ERROR_AUTO_DISMISS_MS = 15_000;
  let hydrateInFlight: Promise<void> | null = null;
  /**
   * Coalesce calls that arrive while a hydrate is in flight. Without this,
   * a rapid leave-then-rejoin sequence loses the second event: the rejoin
   * `workspace_invalidated` arrives during the leave's HTTP fetch, gets
   * deduped to the in-flight promise, and the now-stale leave snapshot is
   * rejected by the version gate — leaving the UI stuck on "gone". When
   * any caller hits the dedupe, we remember it and run one more hydrate
   * after the current one finishes so the latest server state lands.
   */
  let hydratePendingRehydrate = false;

  function clearEchoWorkspaceErrorAutoDismiss() {
    if (echoWorkspaceErrorAutoDismissTimer != null) {
      clearTimeout(echoWorkspaceErrorAutoDismissTimer);
      echoWorkspaceErrorAutoDismissTimer = null;
    }
  }

  function onFriendIdsOrMeChanged(
    friendIds: string[],
    me: string | undefined,
  ): void {
    workspace.friendIdsByUserId.value = patchFriendIdsByUserIdMap(
      workspace.friendIdsByUserId.value,
      me,
      friendIds,
    );
  }

  async function refreshEchoSocialFromApi() {
    const token = authSession.accessToken?.trim() ?? '';
    if (!authSession.isAuthenticated || !authSession.backendUser?.id) return;
    const result = await runEchoWorkspaceSocialRefreshFromApi({
      token,
      isGuest: authSession.backendUser?.isGuest === true,
      workspace,
      mergeEchoBlockedFromApi,
      syncEchoPresenceFromApi,
    });
    if (!result.ok) {
      reportPrimaryFlowFailure('refreshEchoSocialFromApi', result.error, {
        uid: authSession.backendUser?.id,
      });
    }
  }

  function ensureAuthUserInMockUsers() {
    workspace.users.value = applyWorkspaceRosterUsersPipeline(
      workspace.users.value,
      { authUser: authSession.backendUser },
    );
  }

  async function runHydrateEchoFromApi() {
    const token = authSession.accessToken?.trim() ?? '';
    const uid = authSession.backendUser?.id;
    if (!authSession.isAuthenticated || !uid) return;
    const authGenAtStart = authSession.authStateGeneration;
    clearEchoWorkspaceErrorAutoDismiss();
    echoWorkspaceError.value = null;
    const result = await runEchoWorkspaceHydrateFromApi({
      token,
      userId: uid,
      isStale: () =>
        authSession.authStateGeneration !== authGenAtStart ||
        authSession.backendUser?.id !== uid,
      isGuest: authSession.backendUser?.isGuest === true,
      workspace,
      echoSession,
      serverStore,
      activeChannelId,
      activeRailTab,
      getFirstTextChannelId,
      mergeEchoDmThreadsFromApi,
      mergeEchoBlockedFromApi,
      echoDmThreadIds,
      dmCallWithUserId,
      refreshEchoRoleData,
      syncEchoPresenceFromApi,
      ensureAuthUserInMockUsers,
    });
    if (!result.ok) {
      echoWorkspaceError.value = result.userMessage;
      clearEchoWorkspaceErrorAutoDismiss();
      echoWorkspaceErrorAutoDismissTimer = setTimeout(() => {
        echoWorkspaceErrorAutoDismissTimer = null;
        echoWorkspaceError.value = null;
      }, ECHO_WORKSPACE_ERROR_AUTO_DISMISS_MS);
      reportPrimaryFlowFailure(
        'hydrateEchoFromApi',
        result.error,
        { uid },
        { showBanner: false },
      );
      dbgMemberList('hydrateEchoFromApi ERROR', {
        message: echoWorkspaceError.value,
        stack: result.error instanceof Error ? result.error.stack : undefined,
      });
    }
  }

  async function hydrateEchoFromApi() {
    if (hydrateInFlight) {
      hydratePendingRehydrate = true;
      return hydrateInFlight;
    }
    hydrateInFlight = runHydrateEchoFromApi().finally(() => {
      hydrateInFlight = null;
      if (hydratePendingRehydrate) {
        hydratePendingRehydrate = false;
        void hydrateEchoFromApi();
      }
    });
    return hydrateInFlight;
  }

  async function handleServerDeleted(serverId: string) {
    isServerSettingsModalOpen.value = false;
    serverStore.unpinMoreServer(serverId);
    if (authSession.isAuthenticated) {
      await hydrateEchoFromApi();
    }
    const cur = serverStore.selectedServerId;
    const channelBefore = activeChannelId.value;
    applyEchoWorkspaceRetargetAfterServerDeletion({
      deletedServerId: serverId,
      selectedServerId: cur,
      remainingServerRows: workspace.servers.value,
      pickPreferredGuildServerId: () =>
        serverStore.pickPreferredGuildServerId(),
      categoriesByServer: workspace.categoriesByServer.value,
      getFirstTextChannelId,
      selectServer: (id) => serverStore.selectServer(id),
      setActiveChannelId: (cid) => {
        activeChannelId.value = cid;
      },
      activeChannelIdBefore: channelBefore,
    });
    void refreshEchoRoleData();
  }

  function onAuthCredentialsChanged(): void {
    ensureAuthUserInMockUsers();
    if (authSession.isAuthenticated) void hydrateEchoFromApi();
  }

  function onBackendUserChange(
    u: AuthUserPublic | null | undefined,
    prev: AuthUserPublic | null | undefined,
  ): void {
    if (u) return;
    workspace.serverMemberNicknames.value = {};
    applyEchoWorkspaceShellResetOnAuthUserCleared({
      previousBackendUser: prev,
      resetEchoSessionState: () => echoSession.resetSessionState(),
      setExploreRailTab: () => {
        activeRailTab.value = 'explore';
      },
      clearSelectedServer: () => serverStore.selectServer(null),
      removeRosterUserById: (goneId) => {
        workspace.users.value = removeWorkspaceRosterUserById(
          workspace.users.value,
          goneId,
        );
      },
    });
  }

  return {
    echoWorkspaceError,
    hydrateEchoFromApi,
    refreshEchoSocialFromApi,
    handleServerDeleted,
    ensureAuthUserInMockUsers,
    onFriendIdsOrMeChanged,
    onAuthCredentialsChanged,
    onBackendUserChange,
  };
}
