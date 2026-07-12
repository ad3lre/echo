import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { useMessageRowHydration } from './useMessageRowHydration';

function installRafStub() {
  const callbacks: FrameRequestCallback[] = [];
  const raf = vi
    .spyOn(globalThis, 'requestAnimationFrame')
    .mockImplementation((cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
  const caf = vi
    .spyOn(globalThis, 'cancelAnimationFrame')
    .mockImplementation(() => undefined);
  return {
    flushOne() {
      const cb = callbacks.shift();
      if (cb) cb(performance.now());
    },
    raf,
    caf,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMessageRowHydration', () => {
  it('hydrates visible rows on the first scheduled pass', () => {
    const raf = installRafStub();
    const scope = effectScope();
    let hydration: ReturnType<typeof useMessageRowHydration> | null = null;

    scope.run(() => {
      hydration = useMessageRowHydration({
        channelId: () => 'ch1',
        isUserScrollActive: () => false,
        getVisibleMessageIds: () => ['m1', 'm2'],
      });
    });

    hydration!.scheduleHydrationPass();
    expect(hydration!.isRowHydrated('m1')).toBe(false);

    raf.flushOne();

    expect(hydration!.isRowHydrated('m1')).toBe(true);
    expect(hydration!.isRowHydrated('m2')).toBe(true);

    scope.stop();
  });
});
