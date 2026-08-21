import { watch, type Ref } from 'vue';
import type { useServerStore } from '@/features/layout/server';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import { useEchoSessionStore } from '@/features/layout/echoSession';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import type { EchoDmThreadFromApi } from '@/api/echoClient';
import { type RailTab } from '@/features/layout/mainSurface';
import { createEchoWorkspaceLifecycleController } from '@/features/layout/echoWorkspace/echoWorkspaceLifecycleOrchestration';
import { isEchoGraphId } from '@/features/layout/ids/echoIds';
import { isSuspiciousEmptyWorkspace } from '@/features/layout/echoWorkspace/workspaceShellSelection';
import {
  clearSuspiciousEmptyRecoveryLatch,
  isSuspiciousEmptyRecoveryExhausted,
  noteSuspiciousEmptyRecoveryAttempt,
} from '@/features/layout/echoWorkspace/workspaceEmptyRecoveryLatch';
import { readWorkspaceEmptyRecoveryHints } from '@/features/layout/echoWorkspace/workspaceEmptyRecoveryHints';
import { reportPrimaryFlowFailure } from '@/features/layout/failures/primaryFlowFailure';

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

  let suspiciousEmptyRecoveryInFlight = false;
  let lastSuspiciousEmptyRecoveryAtMs = 0;
  const SUSPICIOUS_EMPTY_RECOVERY_COOLDOWN_MS = 4_000;

  watch(
    () =>
      [
        deps.workspace.servers.value.length,
        deps.workspace.fromApi.value,
        deps.workspace.loading.value,
        deps.authSession.isAuthenticated,
        deps.authSession.backendUser?.isGuest,
        deps.authSession.backendUser?.id,
      ] as const,
    ([serverCount, fromApi, loading]) => {
      if (serverCount > 0) {
        clearSuspiciousEmptyRecoveryLatch();
        return;
      }
      const suspicious = isSuspiciousEmptyWorkspace({
        serverCount,
        workspaceFromApi: fromApi,
        isAuthenticated: deps.authSession.isAuthenticated,
        isGuest: deps.authSession.backendUser?.isGuest === true,
        recoveryExhausted: isSuspiciousEmptyRecoveryExhausted(),
        hints: readWorkspaceEmptyRecoveryHints(),
      });
      if (!suspicious || loading) return;
      const now = Date.now();
      if (
        suspiciousEmptyRecoveryInFlight ||
        now - lastSuspiciousEmptyRecoveryAtMs <
          SUSPICIOUS_EMPTY_RECOVERY_COOLDOWN_MS
      ) {
        return;
      }
      noteSuspiciousEmptyRecoveryAttempt();
      lastSuspiciousEmptyRecoveryAtMs = now;
      if (isSuspiciousEmptyRecoveryExhausted()) {
        reportPrimaryFlowFailure(
          'suspiciousEmptyWorkspace.recoveryExhausted',
          new Error(
            'Workspace snapshot empty but client persistence indicates joined guilds',
          ),
          { uid: deps.authSession.backendUser?.id },
          { showBanner: false },
        );
        return;
      }
      suspiciousEmptyRecoveryInFlight = true;
      void vm.hydrateEchoFromApi().finally(() => {
        suspiciousEmptyRecoveryInFlight = false;
      });
    },
    { immediate: true },
  );

  return {
    echoWorkspaceError: vm.echoWorkspaceError,
    hydrateEchoFromApi: vm.hydrateEchoFromApi,
    refreshEchoSocialFromApi: vm.refreshEchoSocialFromApi,
    handleServerDeleted: vm.handleServerDeleted,
    ensureAuthUserInMockUsers: vm.ensureAuthUserInMockUsers,
  };
}
