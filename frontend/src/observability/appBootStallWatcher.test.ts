import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useAppBootStallWatcher } from './appBootStallWatcher';

const postBootStallAlert = vi.fn();
const sessionStore = new Map<string, string>();

vi.mock('@/api/echo/bootStallAlert', () => ({
  postBootStallAlert: (...args: unknown[]) => postBootStallAlert(...args),
}));

function mockSessionStorage() {
  return {
    getItem: (key: string) => sessionStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      sessionStore.set(key, value);
    },
    removeItem: (key: string) => {
      sessionStore.delete(key);
    },
    clear: () => {
      sessionStore.clear();
    },
  };
}

type Deps = Parameters<typeof useAppBootStallWatcher>[0];

function run(deps: Deps) {
  const scope = effectScope(true);
  scope.run(() => useAppBootStallWatcher(deps));
  return scope;
}

describe('useAppBootStallWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    postBootStallAlert.mockReset();
    sessionStore.clear();
    vi.stubGlobal('sessionStorage', mockSessionStorage());
    vi.stubGlobal('navigator', { userAgent: 'vitest' });
    vi.stubGlobal('window', {
      location: { href: 'https://chat-echo.com/' },
    });
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('DEV', false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reports when workspace settles while the boot gate is still visible', async () => {
    const showBootGate = ref(true);
    const initialLoadSettled = ref(false);
    const showAppLayout = ref(true);
    const appLayoutResolved = ref(false);
    const scope = run({
      showBootGate,
      initialLoadSettled,
      showAppLayout,
      appLayoutResolved,
      bootGateTimeoutMs: 3_000,
      hasSession: true,
    });

    initialLoadSettled.value = true;
    await nextTick();
    expect(postBootStallAlert).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_499);
    expect(postBootStallAlert).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(postBootStallAlert).toHaveBeenCalledTimes(1);
    expect(postBootStallAlert.mock.calls[0]?.[0]?.kind).toBe(
      'boot_gate_settled_still_visible',
    );
    scope.stop();
  });

  it('reports when the boot gate exceeds the safety timeout', async () => {
    const scope = run({
      showBootGate: ref(true),
      initialLoadSettled: ref(false),
      showAppLayout: ref(true),
      appLayoutResolved: ref(false),
      bootGateTimeoutMs: 3_000,
      hasSession: false,
    });

    vi.advanceTimersByTime(4_999);
    expect(postBootStallAlert).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(postBootStallAlert).toHaveBeenCalledTimes(1);
    expect(postBootStallAlert.mock.calls[0]?.[0]?.kind).toBe(
      'boot_gate_past_safety_timeout',
    );
    scope.stop();
  });

  it('reports when AppLayout stays unresolved after the boot gate dismisses', async () => {
    const showBootGate = ref(false);
    const showAppLayout = ref(true);
    const appLayoutResolved = ref(false);
    const scope = run({
      showBootGate,
      initialLoadSettled: ref(true),
      showAppLayout,
      appLayoutResolved,
      bootGateTimeoutMs: 3_000,
      hasSession: false,
    });

    vi.advanceTimersByTime(14_999);
    expect(postBootStallAlert).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(postBootStallAlert).toHaveBeenCalledTimes(1);
    expect(postBootStallAlert.mock.calls[0]?.[0]?.kind).toBe(
      'app_layout_chunk_stall',
    );
    expect(
      postBootStallAlert.mock.calls[0]?.[0]?.timing?.stallThresholdMs,
    ).toBe(15_000);
    scope.stop();
  });

  it('sends at most one alert per browser session', async () => {
    sessionStore.set('echo_boot_stall_alert_sent', '1');
    const scope = run({
      showBootGate: ref(true),
      initialLoadSettled: ref(true),
      showAppLayout: ref(true),
      appLayoutResolved: ref(false),
      bootGateTimeoutMs: 3_000,
      hasSession: true,
    });

    vi.advanceTimersByTime(60_000);
    expect(postBootStallAlert).not.toHaveBeenCalled();
    scope.stop();
  });

  it('does not report in dev mode', async () => {
    vi.stubEnv('DEV', true);
    const scope = run({
      showBootGate: ref(true),
      initialLoadSettled: ref(true),
      showAppLayout: ref(true),
      appLayoutResolved: ref(false),
      bootGateTimeoutMs: 3_000,
      hasSession: true,
    });

    vi.advanceTimersByTime(60_000);
    expect(postBootStallAlert).not.toHaveBeenCalled();
    scope.stop();
  });
});
