import { afterEach, describe, expect, it } from 'vitest';
import { ref, type Ref } from 'vue';
import {
  resetRealtimeConnectionBannerForTests,
  useRealtimeConnectionBanner,
  type RealtimeConnectionBannerState,
} from './useRealtimeConnectionBanner';

type FakeTimer = { id: number; fn: () => void; due: number };

function makeFakeTimers() {
  let now = 0;
  let seq = 1;
  const timers = new Map<number, FakeTimer>();
  const setTimeoutFn = (fn: () => void, ms: number) => {
    const id = seq++;
    timers.set(id, { id, fn, due: now + ms });
    return id as unknown as ReturnType<typeof setTimeout>;
  };
  const clearTimeoutFn = (id: ReturnType<typeof setTimeout>) => {
    timers.delete(id as unknown as number);
  };
  const advance = (ms: number) => {
    now += ms;
    for (const t of [...timers.values()].sort((a, b) => a.due - b.due)) {
      if (t.due <= now && timers.has(t.id)) {
        timers.delete(t.id);
        t.fn();
      }
    }
  };
  return { setTimeoutFn, clearTimeoutFn, advance };
}

function run(
  connected: Ref<boolean>,
  timers: ReturnType<typeof makeFakeTimers>,
  opts?: { reconnectingDelayMs?: number; connectedHoldMs?: number },
) {
  const { state } = useRealtimeConnectionBanner({
    connected,
    reconnectingDelayMs: opts?.reconnectingDelayMs ?? 1500,
    connectedHoldMs: opts?.connectedHoldMs ?? 800,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  const stateOf = () => state.value as RealtimeConnectionBannerState;
  return { state, stateOf };
}

describe('useRealtimeConnectionBanner', () => {
  afterEach(() => {
    resetRealtimeConnectionBannerForTests();
  });

  it('stays hidden during the initial pre-connect window', () => {
    const connected = ref(false);
    const timers = makeFakeTimers();
    const { stateOf } = run(connected, timers);
    expect(stateOf()).toBe('hidden');
    timers.advance(5000);
    expect(stateOf()).toBe('hidden');
  });

  it('shows reconnecting only after the debounce once connected before', async () => {
    const connected = ref(false);
    const timers = makeFakeTimers();
    const { stateOf } = run(connected, timers);
    connected.value = true;
    await Promise.resolve();
    expect(stateOf()).toBe('hidden');

    connected.value = false;
    await Promise.resolve();
    expect(stateOf()).toBe('hidden');
    timers.advance(1499);
    expect(stateOf()).toBe('hidden');
    timers.advance(1);
    expect(stateOf()).toBe('reconnecting');
  });

  it('does not flash on a blip shorter than the debounce', async () => {
    const connected = ref(true);
    const timers = makeFakeTimers();
    const { stateOf } = run(connected, timers);
    connected.value = false;
    await Promise.resolve();
    timers.advance(800);
    connected.value = true;
    await Promise.resolve();
    timers.advance(2000);
    expect(stateOf()).toBe('hidden');
  });

  it('shows connected briefly after a visible outage, then hides', async () => {
    const connected = ref(true);
    const timers = makeFakeTimers();
    const { stateOf } = run(connected, timers);
    connected.value = false;
    await Promise.resolve();
    timers.advance(1500);
    expect(stateOf()).toBe('reconnecting');

    connected.value = true;
    await Promise.resolve();
    expect(stateOf()).toBe('connected');
    timers.advance(799);
    expect(stateOf()).toBe('connected');
    timers.advance(1);
    expect(stateOf()).toBe('hidden');
  });

  it('ignores duplicate connect events during the connected recovery hold', async () => {
    const connected = ref(true);
    const timers = makeFakeTimers();
    const { stateOf } = run(connected, timers);
    connected.value = false;
    await Promise.resolve();
    timers.advance(1500);
    expect(stateOf()).toBe('reconnecting');

    connected.value = true;
    await Promise.resolve();
    expect(stateOf()).toBe('connected');

    connected.value = true;
    await Promise.resolve();
    timers.advance(400);
    connected.value = true;
    await Promise.resolve();
    expect(stateOf()).toBe('connected');
    timers.advance(400);
    expect(stateOf()).toBe('hidden');
  });
});
