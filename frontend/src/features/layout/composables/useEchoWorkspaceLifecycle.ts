import { watch, type Ref } from 'vue';
import type { useServerStore } from '@/stores/server';
import type { useAuthSessionStore } from '@/stores/authSession';
import { useEchoSessionStore } from '@/stores/echoSession';
import type { WorkspaceStateApi } from '@/composables/workspace/types';
import type { EchoDmThreadFromApi } from '@/api/echoClient';
import { type RailTab } from '@/features/layout/mainSurface';
import { createEchoWorkspaceLifecycleController } from '@/services/orchestration/echoWorkspaceLifecycleOrchestration';

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

  return {
    echoWorkspaceError: vm.echoWorkspaceError,
    hydrateEchoFromApi: vm.hydrateEchoFromApi,
    refreshEchoSocialFromApi: vm.refreshEchoSocialFromApi,
    handleServerDeleted: vm.handleServerDeleted,
    ensureAuthUserInMockUsers: vm.ensureAuthUserInMockUsers,
  };
}
