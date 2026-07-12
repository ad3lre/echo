import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { API_BASE } from '@/config';
import { useDesktopNativeAttention } from '@/composables/useDesktopNativeAttention';
import { useDesktopGlobalShortcutBringFront } from '@/platform/desktopGlobalShortcutBringFront';
import { useDesktopUpdateMonitor } from '@/composables/useDesktopUpdateMonitor';
import { useDesktopIncomingCallAttention } from '@/composables/useDesktopIncomingCallAttention';
import { useDesktopUpdateStore } from '@/stores/desktopUpdate';
import { useNotificationPreferencesStore } from '@/stores/notificationPreferences';
import {
  bringMainWindowToForeground,
  downloadAndRelaunchDesktopUpdate,
  isDesktop,
} from '@/platform/desktopBridge';
import {
  installExternalLinkClickGate,
  uninstallExternalLinkClickGate,
} from '@/utils/externalLinkClickGate';
import { registerEchoToastQuickReplySender } from '@/features/layout/echoToastQuickReplyBridge';
import {
  subscribePrimaryFlowFailures,
  primaryFlowFailureSuggestsBackendUnreachable,
  type PrimaryFlowFailureDetail,
} from '@/utils/primaryFlowFailure';
import {
  getEchoOutageRecoveryEstimate,
  recordEchoOutageRecoveryDuration,
} from '@/utils/echoOutageRecoveryStats';
import { subscribeUIErrors, type UIErrorSeverity } from '@/utils/uiErrorBus';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { reloadEchoApp } from '@/platform/reloadEchoApp';
import type { SettingsSection } from '@/features/settings/types';
import { storeToRefs } from 'pinia';
import { useEchoSessionStore } from '@/stores/echoSession';

const SOCKET_UNEXPECTED_DISCONNECT_CODE = 'SOCKET_UNEXPECTED_DISCONNECT';

type UiErrorBannerState = {
  message: string;
  severity: UIErrorSeverity;
  retryAction?: () => void;
  code?: string;
};

export type AppLayoutPlatformLifecycleOpts = {
  dmCallRingUi: Ref<boolean>;
  openDmInboxFromRailOverflow: () => void;
  openUserSettingsModal: (section?: SettingsSection) => void;
};

/** Desktop bridges, outage recovery polling, external-link gate, and platform bus subscriptions. */
export function useAppLayoutPlatformLifecycle(
  opts: AppLayoutPlatformLifecycleOpts,
) {
  if (isDesktop()) {
    useDesktopNativeAttention();
    useDesktopGlobalShortcutBringFront();
    useDesktopUpdateMonitor();
    useDesktopIncomingCallAttention(opts.dmCallRingUi);
  }

  const desktopUpdateStore = useDesktopUpdateStore();
  const desktopUpdateBannerVisible = computed(
    () => isDesktop() && Boolean(desktopUpdateStore.pendingVersion),
  );

  async function onDesktopUpdateBannerInstall() {
    if (!isDesktop()) return;
    try {
      await downloadAndRelaunchDesktopUpdate();
    } catch (e) {
      dispatchAppToast(
        e instanceof Error ? e.message : 'Update install failed.',
        'warning',
      );
    }
  }

  function onDesktopUpdateBannerDismiss() {
    desktopUpdateStore.clearPending();
  }

  const primaryFlowFailureBanner = ref<string | null>(null);
  const primaryFlowFailureDetail = ref<PrimaryFlowFailureDetail | null>(null);
  let unsubscribePrimaryFlowFailures: (() => void) | null = null;
  let unsubscribeDesktopTray: (() => void) | undefined;

  const serverHealthChecking = ref(false);
  const serverHealthDown = ref(false);
  const serverHealthOutageSinceMs = ref<number | null>(null);
  const serverHealthLastCheckedAtMs = ref<number | null>(null);
  const serverHealthRecoveringReload = ref(false);
  let serverHealthPollTimer: ReturnType<typeof setInterval> | null = null;

  const _initialRecovery = getEchoOutageRecoveryEstimate();
  const serverHealthAvgRecoveryEstimateSec = ref(
    _initialRecovery.estimateSeconds,
  );
  const serverHealthAvgRecoverySampleCount = ref(_initialRecovery.sampleCount);

  const likelyBackendDownPrimaryFlow = computed(() => {
    const d = primaryFlowFailureDetail.value;
    return d ? primaryFlowFailureSuggestsBackendUnreachable(d) : false;
  });

  const serverDownGateDetail = computed(() => {
    const b = primaryFlowFailureBanner.value?.trim();
    if (b) return b;
    const d = primaryFlowFailureDetail.value;
    if (!d) return null;
    const u = d.userMessage?.trim();
    return u || `Primary flow error — ${d.flow}: ${d.message}`;
  });

  const serverDownGateBind = computed(() => ({
    checking: serverHealthChecking.value,
    outageSinceMs: serverHealthOutageSinceMs.value,
    lastCheckedAtMs: serverHealthLastCheckedAtMs.value,
    detail: serverDownGateDetail.value,
    averageRecoverySeconds: serverHealthAvgRecoveryEstimateSec.value,
    recoverySampleCount: serverHealthAvgRecoverySampleCount.value,
  }));

  const showServerDownGate = computed(
    () =>
      !echoSyncCapabilities.isMockDataMode &&
      likelyBackendDownPrimaryFlow.value &&
      serverHealthDown.value,
  );

  const uiErrorBanner = ref<UiErrorBannerState | null>(null);
  const uiErrorRetryBusy = ref(false);
  let uiErrorAutoDismissTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribeUiErrors: (() => void) | null = null;
  let stopLiveSyncConnectedWatch: (() => void) | null = null;
  const HEADER_INFO_AUTO_DISMISS_MS = 15_000;

  async function verifyEchoApiReachableAfterHealthOk(): Promise<boolean> {
    try {
      const ts = Date.now();
      await fetch(
        `${API_BASE.replace(/\/$/, '')}/api/v1/auth/me?recoverProbe=${ts}`,
        {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        },
      );
      return true;
    } catch {
      return false;
    }
  }

  async function checkServerHealthNow() {
    serverHealthChecking.value = true;
    const wasDown = serverHealthDown.value;
    const checkedAt = Date.now();
    try {
      const res = await fetch(
        `${API_BASE.replace(/\/$/, '')}/api/v1/health?ts=${checkedAt}`,
        {
          method: 'GET',
          cache: 'no-store',
        },
      );
      serverHealthLastCheckedAtMs.value = checkedAt;
      if (res.ok) {
        const apiReachable = await verifyEchoApiReachableAfterHealthOk();
        if (!apiReachable) {
          serverHealthDown.value = true;
          if (!serverHealthOutageSinceMs.value) {
            serverHealthOutageSinceMs.value = checkedAt;
          }
          return;
        }
        if (wasDown) {
          const since = serverHealthOutageSinceMs.value;
          if (since != null) {
            recordEchoOutageRecoveryDuration(Date.now() - since);
            const next = getEchoOutageRecoveryEstimate();
            serverHealthAvgRecoveryEstimateSec.value = next.estimateSeconds;
            serverHealthAvgRecoverySampleCount.value = next.sampleCount;
          }
        }
        serverHealthDown.value = false;
        serverHealthOutageSinceMs.value = null;
        primaryFlowFailureDetail.value = null;
        primaryFlowFailureBanner.value = null;
        if (wasDown) {
          triggerServerRecoveryReload();
        }
      } else {
        serverHealthDown.value = true;
        if (!serverHealthOutageSinceMs.value) {
          serverHealthOutageSinceMs.value = checkedAt;
        }
      }
    } catch {
      serverHealthLastCheckedAtMs.value = checkedAt;
      serverHealthDown.value = true;
      if (!serverHealthOutageSinceMs.value) {
        serverHealthOutageSinceMs.value = checkedAt;
      }
    } finally {
      serverHealthChecking.value = false;
    }
  }

  function clearServerHealthPolling() {
    if (serverHealthPollTimer != null) {
      clearInterval(serverHealthPollTimer);
      serverHealthPollTimer = null;
    }
  }

  function triggerServerRecoveryReload() {
    if (serverHealthRecoveringReload.value) return;
    serverHealthRecoveringReload.value = true;
    try {
      const now = Date.now();
      const key = 'echo_server_recovery_reload_at';
      const prev = Number(window.sessionStorage.getItem(key) || '0');
      if (Number.isFinite(prev) && prev > 0 && now - prev < 30_000) {
        serverHealthRecoveringReload.value = false;
        return;
      }
      window.sessionStorage.setItem(key, String(now));
    } catch {
      /* ignore storage availability issues */
    }
    clearServerHealthPolling();
    window.setTimeout(() => {
      reloadEchoApp();
    }, 450);
  }

  watch(
    likelyBackendDownPrimaryFlow,
    (on) => {
      clearServerHealthPolling();
      if (!on) {
        serverHealthChecking.value = false;
        serverHealthDown.value = false;
        serverHealthOutageSinceMs.value = null;
        serverHealthLastCheckedAtMs.value = null;
        return;
      }
      void checkServerHealthNow();
      serverHealthPollTimer = setInterval(() => {
        void checkServerHealthNow();
      }, 5000);
    },
    { immediate: true },
  );

  function dismissPrimaryFlowFailureBanner() {
    primaryFlowFailureBanner.value = null;
    primaryFlowFailureDetail.value = null;
  }

  function dismissUiErrorBanner() {
    if (uiErrorAutoDismissTimer != null) {
      clearTimeout(uiErrorAutoDismissTimer);
      uiErrorAutoDismissTimer = null;
    }
    uiErrorBanner.value = null;
  }

  async function onUiErrorRetry() {
    const act = uiErrorBanner.value?.retryAction;
    if (!act || uiErrorRetryBusy.value) return;
    if (uiErrorAutoDismissTimer != null) {
      clearTimeout(uiErrorAutoDismissTimer);
      uiErrorAutoDismissTimer = null;
    }
    uiErrorRetryBusy.value = true;
    try {
      await Promise.resolve(act());
    } finally {
      uiErrorRetryBusy.value = false;
    }
    dismissUiErrorBanner();
  }

  function disposePlatformLifecycleSideEffects() {
    unsubscribeDesktopTray?.();
    unsubscribeDesktopTray = undefined;
    registerEchoToastQuickReplySender(null);
    unsubscribePrimaryFlowFailures?.();
    unsubscribePrimaryFlowFailures = null;
    unsubscribeUiErrors?.();
    unsubscribeUiErrors = null;
    stopLiveSyncConnectedWatch?.();
    stopLiveSyncConnectedWatch = null;
    if (uiErrorAutoDismissTimer != null) {
      clearTimeout(uiErrorAutoDismissTimer);
      uiErrorAutoDismissTimer = null;
    }
    uninstallExternalLinkClickGate();
    clearServerHealthPolling();
  }

  onMounted(() => {
    if (isDesktop()) {
      void import('@tauri-apps/api/event').then(({ listen }) => {
        void listen<{ action?: string }>('echo-desktop-tray', async (event) => {
          const action = event.payload?.action;
          await bringMainWindowToForeground();
          if (action === 'open-messages') {
            opts.openDmInboxFromRailOverflow();
          } else if (action === 'open-notification-settings') {
            opts.openUserSettingsModal('Notifications');
          } else if (action === 'toggle-desktop-alerts') {
            const np = useNotificationPreferencesStore();
            np.patch({ desktopAlerts: !np.settings.desktopAlerts });
          }
        }).then((unlisten) => {
          unsubscribeDesktopTray = unlisten;
        });
      });
    }

    unsubscribePrimaryFlowFailures = subscribePrimaryFlowFailures((d) => {
      if (d.suppressBanner) return;
      primaryFlowFailureDetail.value = d;
      const friendly = d.userMessage?.trim();
      primaryFlowFailureBanner.value = friendly
        ? friendly
        : `Primary flow error — ${d.flow}: ${d.message}`;
    });

    const echoSession = useEchoSessionStore();
    const { liveSyncConnected } = storeToRefs(echoSession);
    stopLiveSyncConnectedWatch = watch(liveSyncConnected, (connected) => {
      if (
        connected &&
        uiErrorBanner.value?.code === SOCKET_UNEXPECTED_DISCONNECT_CODE
      ) {
        dismissUiErrorBanner();
      }
    });

    unsubscribeUiErrors = subscribeUIErrors((d) => {
      if (d.code === SOCKET_UNEXPECTED_DISCONNECT_CODE) return;
      if (uiErrorAutoDismissTimer != null) {
        clearTimeout(uiErrorAutoDismissTimer);
        uiErrorAutoDismissTimer = null;
      }
      uiErrorBanner.value = {
        message: d.userMessage,
        severity: d.severity,
        retryAction: d.retryAction,
        code: d.code,
      };
      uiErrorAutoDismissTimer = setTimeout(() => {
        uiErrorAutoDismissTimer = null;
        uiErrorBanner.value = null;
      }, HEADER_INFO_AUTO_DISMISS_MS);
    });

    installExternalLinkClickGate();
  });

  onUnmounted(() => {
    disposePlatformLifecycleSideEffects();
  });

  return {
    desktopUpdateBannerVisible,
    desktopUpdatePendingVersion: computed(
      () => desktopUpdateStore.pendingVersion ?? '',
    ),
    onDesktopUpdateBannerInstall,
    onDesktopUpdateBannerDismiss,
    primaryFlowFailureBanner,
    showServerDownGate,
    serverDownGateBind,
    uiErrorBanner,
    uiErrorRetryBusy,
    dismissPrimaryFlowFailureBanner,
    dismissUiErrorBanner,
    onUiErrorRetry,
    checkServerHealthNow,
    disposePlatformLifecycleSideEffects,
  };
}
