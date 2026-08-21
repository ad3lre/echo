// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref, nextTick, createApp, defineComponent } from 'vue';
import { useAppLayoutPlatformLifecycle } from './useAppLayoutPlatformLifecycle';

vi.mock('@/platform/syncCapabilities', () => ({
  echoSyncCapabilities: { isMockDataMode: false },
}));

vi.mock('@/features/layout/composables/shell/echoOutageRecoveryStats', () => ({
  getEchoOutageRecoveryEstimate: () => ({
    estimateSeconds: 30,
    sampleCount: 0,
  }),
  recordEchoOutageRecoveryDuration: vi.fn(),
}));

vi.mock('@/platform/desktopBridge', () => ({
  isDesktop: () => false,
  openExternal: vi.fn(),
}));

vi.mock('@/features/layout/composables/shell/externalLinkClickGate', () => ({
  installExternalLinkClickGate: vi.fn(),
  uninstallExternalLinkClickGate: vi.fn(),
}));

vi.mock('@/features/layout/echoToastQuickReplyBridge', () => ({
  registerEchoToastQuickReplySender: vi.fn(),
}));

const subscribePrimaryFlowFailures = vi.fn((_listener: unknown) => vi.fn());
vi.mock('@/features/layout/failures/primaryFlowFailure', () => ({
  subscribePrimaryFlowFailures: (listener: unknown) =>
    subscribePrimaryFlowFailures(listener),
  primaryFlowFailureSuggestsBackendUnreachable: () => false,
}));

const subscribeUIErrors = vi.fn((_listener: unknown) => vi.fn());
vi.mock('@/features/layout/failures/uiErrorBus', () => ({
  subscribeUIErrors: (listener: unknown) => subscribeUIErrors(listener),
}));

vi.mock('@/features/layout/echoSession', () => ({
  useEchoSessionStore: () => ({
    liveSyncConnected: ref(false),
  }),
}));

describe('useAppLayoutPlatformLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('installs external link gate and bus subscriptions on mount', async () => {
    const { installExternalLinkClickGate } =
      await import('@/features/layout/composables/shell/externalLinkClickGate');

    const app = createApp(
      defineComponent({
        setup() {
          useAppLayoutPlatformLifecycle();
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
