import { onMounted, onUnmounted, watch, type Ref } from 'vue';
import type { useServerStore } from '@/features/layout/server';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/useEchoWorkspace';
import type { RailTab } from '@/features/layout/mainSurface';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { ensureIconCatalogLoaded } from '@/assets/iconCatalog';
import { echoDevTrace } from '@/observability/echoDevTrace';
import { applySavedServerRailOrder } from '@/features/layout/composables/rail/serverRailOrderPersistence';
import { hasPriorRegistration } from '@/features/layout/priorRegistration';
import { applyWorkspaceBootstrapServerNav } from '@/features/layout/echoWorkspace/workspaceBootstrapServerNav';
import { isSuspiciousEmptyWorkspace } from '@/features/layout/echoWorkspace/workspaceShellSelection';
import { isSuspiciousEmptyRecoveryExhausted } from '@/features/layout/echoWorkspace/workspaceEmptyRecoveryLatch';
import { readWorkspaceEmptyRecoveryHints } from '@/features/layout/echoWorkspace/workspaceEmptyRecoveryHints';

function logIconCatalogPrefetchFailure(err: unknown): void {
  echoDevTrace('icon_catalog_prefetch_failed', {
    message: err instanceof Error ? err.message : String(err),
  });
}

export function useAppLayoutBootstrap(deps: {
  serverStore: ReturnType<typeof useServerStore>;
  workspace: WorkspaceStateApi;
  activeRailTab: Ref<RailTab>;
  isMoreServersPinned: Ref<boolean>;
  isMoreServersPanelOpen: Ref<boolean>;
  isMemberPopoutOpen: Ref<boolean>;
  isSelfProfilePopoutOpen: Ref<boolean>;
  activeChannelId: Ref<string>;
  /** First text channel in a server's category list — used to land the bootstrap guild. */
  getFirstTextChannelId: (
    cats: { name: string; channels: { id: string; type: string }[] }[],
  ) => string;
  /** Active Echo DM channel ids — guards against stealing focus from an open DM. */
  echoDmThreadIds?: Ref<Set<string>>;
  /** Peer id of an in-progress DM call, if any. */
  dmCallWithUserId?: Ref<string | null>;
  onEchoMessageFailedGuest: (ev: Event) => void;
  /** After password reset deep link / session flag, open Echo login. */
  openAuthModal?: (opts?: {
    entry?: 'social' | 'echo';
    passkey?: boolean;
    tab?: 'login' | 'register';
    forgot?: boolean;
  }) => void;
}) {
  const {
    serverStore,
    workspace,
    activeRailTab,
    isMoreServersPinned,
    isMoreServersPanelOpen,
    isMemberPopoutOpen,
    isSelfProfilePopoutOpen,
    activeChannelId,
    getFirstTextChannelId,
    echoDmThreadIds,
    dmCallWithUserId,
    onEchoMessageFailedGuest,
  } = deps;

  onMounted(() => {
    const authSession = useAuthSessionStore();
    if (authSession.backendUser?.isGuest === true) {
      serverStore.selectServer(null);
      activeRailTab.value = 'explore';
    } else if (
      serverStore.servers.length > 0 ||
      (authSession.backendUser != null && hasPriorRegistration())
    ) {
      // Optimistic: returning members almost always land in a server. Show the
      // servers rail immediately (skeleton until data arrives) instead of flashing
      // Explore first. The reactive watch below selects the preferred guild once
      // `workspace.servers` is populated (synchronously for pre-hydrated users).
      // If the authoritative load returns no joined servers, the watch falls back
      // to Explore.
      activeRailTab.value = 'servers';
    } else {
      // First-time / unknown visitor — default the UI to the public Explore directory
      serverStore.selectServer(null);
      activeRailTab.value = 'explore';
    }
    // Prefetch large icon catalog in background during idle so opening icon picker won't spike.
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(
        () => {
          void ensureIconCatalogLoaded().catch(logIconCatalogPrefetchFailure);
        },
        { timeout: 5000 },
      );
    } else {
      // Fallback: start loading after a short timeout to avoid competing with critical startup work.
      setTimeout(
        () =>
          void ensureIconCatalogLoaded().catch(logIconCatalogPrefetchFailure),
        3000,
      );
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('echo-message-failed', onEchoMessageFailedGuest);
    }
    try {
      if (sessionStorage.getItem('echo_post_password_reset') === '1') {
        sessionStorage.removeItem('echo_post_password_reset');
        deps.openAuthModal?.({ entry: 'echo', tab: 'login' });
      }
    } catch {
      /* ignore */
    }
  });

  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener(
        'echo-message-failed',
        onEchoMessageFailedGuest,
      );
    }
  });

  watch(
    workspace.servers,
    (servers) => {
      const next = applySavedServerRailOrder(servers);
      // `workspace.servers` is the echo session ref; `setServers` assigns back into it.
      // `applySavedServerRailOrder` usually returns a new array with identical order → retrigger
      // this watch forever (Vue "Maximum recursive updates exceeded" on AppLayout).
      if (
        next.length === servers.length &&
        next.every((s, i) => s === servers[i])
      ) {
        return;
      }
      serverStore.setServers(next);
    },
    { immediate: true },
  );

  /**
   * Data-driven guild selection: mirror the reconnect hydrate path so the boot
   * path picks the preferred guild + first text channel as soon as workspace data
   * is available. With `immediate: true` this fires synchronously during setup for
   * pre-hydrated users (selecting before first paint) and again when the network
   * snapshot arrives for cold-start users. If the authoritative load resolves with
   * no joined servers, revert the optimistic 'servers' guess back to Explore.
   */
  watch(
    [workspace.servers, workspace.fromApi],
    ([servers, fromApi]) => {
      const authSession = useAuthSessionStore();
      const isGuestUser = authSession.backendUser?.isGuest === true;
      if (isGuestUser) return;
      if (servers.length > 0) {
        applyWorkspaceBootstrapServerNav({
          servers,
          serverStore,
          activeRailTab,
          activeChannelId,
          categoriesByServer: workspace.categoriesByServer.value,
          getFirstTextChannelId,
          echoDmThreadIds: echoDmThreadIds?.value ?? null,
          dmCallWithUserId: dmCallWithUserId?.value ?? null,
        });
        return;
      }
      const suspiciousEmpty = isSuspiciousEmptyWorkspace({
        serverCount: servers.length,
        workspaceFromApi: fromApi,
        isAuthenticated: authSession.isAuthenticated,
        isGuest: isGuestUser,
        recoveryExhausted: isSuspiciousEmptyRecoveryExhausted(),
        hints: readWorkspaceEmptyRecoveryHints(),
      });
      if (
        fromApi &&
        !suspiciousEmpty &&
        activeRailTab.value === 'servers' &&
        !serverStore.selectedServerId
      ) {
        serverStore.selectServer(null);
        activeRailTab.value = 'explore';
      }
    },
    { immediate: true },
  );

  watch(
    () => serverStore.selectedServerId,
    () => {
      if (!isMoreServersPinned.value) {
        isMoreServersPanelOpen.value = false;
      }
    },
  );

  watch([() => serverStore.selectedServerId, activeChannelId], () => {
    isMemberPopoutOpen.value = false;
    if (!isSelfProfilePopoutOpen.value) return;
  });
}
