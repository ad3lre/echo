// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref, nextTick, createApp, defineComponent } from 'vue';
import { useAppLayoutPlatformLifecycle } from './useAppLayoutPlatformLifecycle';

vi.mock('@/stores/desktopUpdate', () => ({
  useDesktopUpdateStore: () => ({
    pendingVersion: null,
    clearPending: vi.fn(),
  }),
}));

vi.mock('@/composables/useDesktopUpdateMonitor', () => ({
  useDesktopUpdateMonitor: vi.fn(),
}));

vi.mock('@/composables/useDesktopNativeAttention', () => ({
  useDesktopNativeAttention: vi.fn(),
}));

vi.mock('@/platform/desktopGlobalShortcutBringFront', () => ({
  useDesktopGlobalShortcutBringFront: vi.fn(),
}));

vi.mock('@/composables/useDesktopIncomingCallAttention', () => ({
  useDesktopIncomingCallAttention: vi.fn(),
}));

vi.mock('@/platform/syncCapabilities', () => ({
  echoSyncCapabilities: { isMockDataMode: false },
}));

vi.mock('@/utils/echoOutageRecoveryStats', () => ({
  getEchoOutageRecoveryEstimate: () => ({
    estimateSeconds: 30,
    sampleCount: 0,
  }),
  recordEchoOutageRecoveryDuration: vi.fn(),
}));

vi.mock('@/platform/desktopBridge', () => ({
  isDesktop: () => false,
  bringMainWindowToForeground: vi.fn(),
  downloadAndRelaunchDesktopUpdate: vi.fn(),
  openExternal: vi.fn(),
}));

vi.mock('@/utils/externalLinkClickGate', () => ({
  installExternalLinkClickGate: vi.fn(),
  uninstallExternalLinkClickGate: vi.fn(),
}));

vi.mock('@/features/layout/echoToastQuickReplyBridge', () => ({
  registerEchoToastQuickReplySender: vi.fn(),
}));

const subscribePrimaryFlowFailures = vi.fn((_listener: unknown) => vi.fn());
vi.mock('@/utils/primaryFlowFailure', () => ({
  subscribePrimaryFlowFailures: (listener: unknown) =>
    subscribePrimaryFlowFailures(listener),
  primaryFlowFailureSuggestsBackendUnreachable: () => false,
}));

const subscribeUIErrors = vi.fn((_listener: unknown) => vi.fn());
vi.mock('@/utils/uiErrorBus', () => ({
  subscribeUIErrors: (listener: unknown) => subscribeUIErrors(listener),
}));

describe('useAppLayoutPlatformLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('installs external link gate and bus subscriptions on mount', async () => {
    const { installExternalLinkClickGate } =
      await import('@/utils/externalLinkClickGate');

    const app = createApp(
      defineComponent({
        setup() {
          useAppLayoutPlatformLifecycle({
            dmCallRingUi: ref(false),
            openDmInboxFromRailOverflow: vi.fn(),
            openUserSettingsModal: vi.fn(),
          });
          return () => null;
        },
      }),
    );
    const el = document.createElement('div');
    app.mount(el);
    await nextTick();
    app.unmount();

    expect(installExternalLinkClickGate).toHaveBeenCalledTimes(1);
    expect(subscribePrimaryFlowFailures).toHaveBeenCalledTimes(1);
    expect(subscribeUIErrors).toHaveBeenCalledTimes(1);
  });
});
