import { onMounted, onUnmounted, watch, type Ref } from 'vue';
import type { useServerStore } from '@/stores/server';
import type { WorkspaceStateApi } from '@/composables/useEchoWorkspace';
import type { RailTab } from '@/features/layout/mainSurface';
import { useAuthSessionStore } from '@/stores/authSession';
import { ensureIconCatalogLoaded } from '@/assets/iconCatalog';
import { echoDevTrace } from '@/observability/echoDevTrace';
import { applySavedServerRailOrder } from '@/utils/serverRailOrderPersistence';

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
    onEchoMessageFailedGuest,
  } = deps;

  onMounted(() => {
    const authSession = useAuthSessionStore();
    if (authSession.backendUser?.isGuest === true) {
      serverStore.selectServer(null);
      activeRailTab.value = 'explore';
    } else if (serverStore.servers.length > 0) {
      const preferred = serverStore.pickPreferredGuildServerId();
      if (preferred) serverStore.selectServer(preferred);
      activeRailTab.value = 'servers';
    } else {
      // No joined servers — default the UI to the public Explore directory
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
