import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useAppBootGate } from './useAppBootGate';

type Deps = Parameters<typeof useAppBootGate>[0];

function run(deps: Deps) {
  const scope = effectScope(true);
  const api = scope.run(() => useAppBootGate(deps))!;
  return { api, scope };
}

describe('useAppBootGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reveals immediately when the workspace is already settled at setup', () => {
    const { api, scope } = run({
      hasSession: false,
      warmPainted: false,
      initialLoadSettled: ref(true),
      timeoutMs: 30_000,
      fastRevealMs: 600,
    });
    expect(api.showBootGate.value).toBe(false);
    scope.stop();
  });

  it('starts gated and fast-reveals after fastRevealMs for progressive loading', async () => {
    const settled = ref(false);
    const { api, scope } = run({
      hasSession: true,
      warmPainted: false,
      initialLoadSettled: settled,
      timeoutMs: 30_000,
      fastRevealMs: 600,
    });
    expect(api.showBootGate.value).toBe(true);

    vi.advanceTimersByTime(599);
    expect(api.showBootGate.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(api.showBootGate.value).toBe(false);

    settled.value = true;
    await nextTick();
    vi.advanceTimersByTime(30_000);
    expect(api.showBootGate.value).toBe(false);
    scope.stop();
  });

  it('starts gated and fast-reveals for warm-painted content', () => {
    const { api, scope } = run({
      hasSession: false,
      warmPainted: true,
      initialLoadSettled: ref(false),
      timeoutMs: 30_000,
      fastRevealMs: 600,
    });
    expect(api.showBootGate.value).toBe(true);

    vi.advanceTimersByTime(600);
    expect(api.showBootGate.value).toBe(false);
    scope.stop();
  });

  it('gates a no-session cold start and reveals after fastRevealMs', async () => {
    const settled = ref(false);
    const { api, scope } = run({
      hasSession: false,
      warmPainted: false,
      initialLoadSettled: settled,
      timeoutMs: 30_000,
      fastRevealMs: 600,
    });
    expect(api.showBootGate.value).toBe(true);

    vi.advanceTimersByTime(600);
    expect(api.showBootGate.value).toBe(false);

    settled.value = true;
    await nextTick();
    expect(api.showBootGate.value).toBe(false);
    scope.stop();
  });

  it('force-reveals after the safety timeout if fastRevealMs is not reached', () => {
    const { api, scope } = run({
      hasSession: false,
      warmPainted: false,
      initialLoadSettled: ref(false),
      timeoutMs: 3000,
      fastRevealMs: 100_000,
    });
    expect(api.showBootGate.value).toBe(true);

    vi.advanceTimersByTime(2999);
    expect(api.showBootGate.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(api.showBootGate.value).toBe(false);
    scope.stop();
  });

  it('reveals immediately when the workspace settles before fastRevealMs', async () => {
    const settled = ref(false);
    const { api, scope } = run({
      hasSession: false,
      warmPainted: false,
      initialLoadSettled: settled,
      timeoutMs: 30_000,
      fastRevealMs: 600,
    });
    expect(api.showBootGate.value).toBe(true);

    settled.value = true;
    await nextTick();
    expect(api.showBootGate.value).toBe(false);

    vi.advanceTimersByTime(30_000);
    expect(api.showBootGate.value).toBe(false);
    scope.stop();
  });

  it('clears both timers on scope dispose (no reveal after teardown)', () => {
    const { api, scope } = run({
      hasSession: false,
      warmPainted: false,
      initialLoadSettled: ref(false),
      timeoutMs: 3000,
      fastRevealMs: 600,
    });
    expect(api.showBootGate.value).toBe(true);
    scope.stop();
    vi.advanceTimersByTime(3000);
    expect(api.showBootGate.value).toBe(true);
  });
});
