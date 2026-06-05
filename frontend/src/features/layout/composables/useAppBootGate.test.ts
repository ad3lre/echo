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

  it('does not gate when a session is present at boot', async () => {
    const settled = ref(false);
    const { api, scope } = run({
      hasSession: true,
      warmPainted: false,
      initialLoadSettled: settled,
      timeoutMs: 30_000,
    });
    expect(api.showBootGate.value).toBe(false);
    // Stays revealed even as the load progresses / time passes.
    settled.value = true;
    await nextTick();
    vi.advanceTimersByTime(30_000);
    expect(api.showBootGate.value).toBe(false);
    scope.stop();
  });

  it('does not gate when content was warm-painted from cache', () => {
    const { api, scope } = run({
      hasSession: false,
      warmPainted: true,
      initialLoadSettled: ref(false),
      timeoutMs: 30_000,
    });
    expect(api.showBootGate.value).toBe(false);
    scope.stop();
  });

  it('does not gate when the load already settled before mount', () => {
    const { api, scope } = run({
      hasSession: false,
      warmPainted: false,
      initialLoadSettled: ref(true),
      timeoutMs: 30_000,
    });
    expect(api.showBootGate.value).toBe(false);
    scope.stop();
  });

  it('gates a no-session cold start until the load settles', async () => {
    const settled = ref(false);
    const { api, scope } = run({
      hasSession: false,
      warmPainted: false,
      initialLoadSettled: settled,
      timeoutMs: 30_000,
    });
    expect(api.showBootGate.value).toBe(true);

    settled.value = true;
    await nextTick();
    expect(api.showBootGate.value).toBe(false);
    scope.stop();
  });

  it('force-reveals after the timeout if the load never settles', () => {
    const { api, scope } = run({
      hasSession: false,
      warmPainted: false,
      initialLoadSettled: ref(false),
      timeoutMs: 30_000,
    });
    expect(api.showBootGate.value).toBe(true);

    vi.advanceTimersByTime(29_999);
    expect(api.showBootGate.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(api.showBootGate.value).toBe(false);
    scope.stop();
  });

  it('clears the timeout on scope dispose (no force-reveal after teardown)', () => {
    const { api, scope } = run({
      hasSession: false,
      warmPainted: false,
      initialLoadSettled: ref(false),
      timeoutMs: 30_000,
    });
    expect(api.showBootGate.value).toBe(true);
    scope.stop();
    vi.advanceTimersByTime(30_000);
    expect(api.showBootGate.value).toBe(true);
  });
});
