import { watch, type Ref } from 'vue';
import type { useServerStore } from '@/stores/server';
import type { useAuthSessionStore } from '@/stores/authSession';
import { useEchoSessionStore } from '@/stores/echoSession';
import type { WorkspaceStateApi } from '@/composables/workspace/types';
import type { EchoDmThreadFromApi } from '@/api/echoClient';
import { type RailTab } from '@/features/layout/mainSurface';
import { createEchoWorkspaceLifecycleController } from '@/services/orchestration/echoWorkspaceLifecycleOrchestration';
import { isEchoGraphId } from '@/utils/echoIds';

export function useEchoWorkspaceLifecycle(deps: {
  serverStore: ReturnType<typeof useServerStore>;
  authSession: ReturnType<typeof useAuthSessionStore>;
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
}) {
  const echoSession = useEchoSessionStore();
  const vm = createEchoWorkspaceLifecycleController({
    ...deps,
    echoSession,
  });

  watch(
    () =>
      [
        deps.workspace.friendIds.value,
        deps.authSession.backendUser?.id,
      ] as const,
    ([ids, me]) => vm.onFriendIdsOrMeChanged(ids, me),
    { deep: true, immediate: true },
  );

  watch(
    () =>
      [
        deps.authSession.accessToken,
        deps.authSession.backendUser?.id,
        /** Guest upgrade / profile swap can keep the same `id`; `setSession` still bumps this. */
        deps.authSession.authStateGeneration,
      ] as const,
    () => vm.onAuthCredentialsChanged(),
    { immediate: true },
  );

  watch(
    () => deps.authSession.backendUser,
    (u, prev) => vm.onBackendUserChange(u, prev),
  );

  /**
   * Voice / VC roster lives in the workspace snapshot. Peers in another guild can
   * miss `workspace_invalidated` until they open a channel there (socket
   * `echo:server:*` scope). Re-fetch when the selected guild changes so the
   * channel tree matches the server you are looking at without a full reload.
   */
  watch(
    () => deps.serverStore.selectedServerId,
    (sid) => {
      if (!deps.authSession.isAuthenticated) return;
      const id = typeof sid === 'string' ? sid.trim() : '';
      if (!id || id === 'echo' || !isEchoGraphId(id)) return;
      void vm.hydrateEchoFromApi();
    },
  );

  return {
    echoWorkspaceError: vm.echoWorkspaceError,
    hydrateEchoFromApi: vm.hydrateEchoFromApi,
    refreshEchoSocialFromApi: vm.refreshEchoSocialFromApi,
    handleServerDeleted: vm.handleServerDeleted,
    ensureAuthUserInMockUsers: vm.ensureAuthUserInMockUsers,
  };
}
