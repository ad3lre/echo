import { describe, expect, it, vi } from 'vitest';
import {
  createSocketLivenessWatchdog,
  type SocketLivenessWatchdogDeps,
} from '../socketLivenessWatchdog';

function makeWatchdog(overrides: Partial<SocketLivenessWatchdogDeps> = {}) {
  const recycle = vi.fn();
  const probe = vi.fn(async () => true);
  const deps: SocketLivenessWatchdogDeps = {
    isConnected: () => true,
    isVisible: () => true,
    probe,
    recycle,
    maxStrikes: 2,
    ...overrides,
  };
  const wd = createSocketLivenessWatchdog(deps);
  return { wd, recycle, probe, deps };
}

describe('createSocketLivenessWatchdog', () => {
  it('does not probe while the tab is hidden', async () => {
    const probe = vi.fn(async () => false);
    const { wd, recycle } = makeWatchdog({ isVisible: () => false, probe });
    await wd.tick();
    expect(probe).not.toHaveBeenCalled();
    expect(recycle).not.toHaveBeenCalled();
  });

  it('does not probe while disconnected', async () => {
    const probe = vi.fn(async () => false);
    const { wd, recycle } = makeWatchdog({ isConnected: () => false, probe });
    await wd.tick();
    expect(probe).not.toHaveBeenCalled();
    expect(recycle).not.toHaveBeenCalled();
  });

  it('resets strikes on a successful probe and never recycles', async () => {
    const probe = vi.fn(async () => true);
    const { wd, recycle } = makeWatchdog({ probe });
    await wd.tick();
    await wd.tick();
    await wd.tick();
    expect(probe).toHaveBeenCalledTimes(3);
    expect(recycle).not.toHaveBeenCalled();
  });

  it('recycles after maxStrikes consecutive missed probes', async () => {
    const probe = vi.fn(async () => false);
    const { wd, recycle } = makeWatchdog({ probe, maxStrikes: 2 });
    await wd.tick(); // strike 1
    expect(recycle).not.toHaveBeenCalled();
    await wd.tick(); // strike 2 -> recycle
    expect(recycle).toHaveBeenCalledTimes(1);
  });

  it('resets the strike count after a recycle (no recycle storm)', async () => {
    const probe = vi.fn(async () => false);
    const { wd, recycle } = makeWatchdog({ probe, maxStrikes: 2 });
    await wd.tick();
    await wd.tick(); // recycle #1
    await wd.tick(); // strike 1 again, no recycle yet
    expect(recycle).toHaveBeenCalledTimes(1);
    await wd.tick(); // strike 2 -> recycle #2
    expect(recycle).toHaveBeenCalledTimes(2);
  });

  it('a recovered probe between misses prevents a recycle', async () => {
    let result = false;
    const probe = vi.fn(async () => result);
    const { wd, recycle } = makeWatchdog({ probe, maxStrikes: 2 });
    await wd.tick(); // miss -> strike 1
    result = true;
    await wd.tick(); // ack -> reset
    result = false;
    await wd.tick(); // miss -> strike 1 (not 2)
    expect(recycle).not.toHaveBeenCalled();
  });

  it('does not count a strike if the socket dropped during the probe', async () => {
    let connected = true;
    const probe = vi.fn(async () => {
      connected = false; // simulate disconnect mid-probe
      return false;
    });
    const { wd, recycle } = makeWatchdog({
      probe,
      isConnected: () => connected,
      maxStrikes: 1,
    });
    await wd.tick();
    expect(recycle).not.toHaveBeenCalled();
  });

  it('never overlaps probes', async () => {
    let resolveProbe!: (ok: boolean) => void;
    const probe = vi.fn(
      () =>
        new Promise<boolean>((r) => {
          resolveProbe = r;
        }),
    );
    const { wd } = makeWatchdog({ probe });
    const first = wd.tick();
    void wd.tick(); // should be ignored while the first is in flight
    expect(probe).toHaveBeenCalledTimes(1);
    resolveProbe(true);
    await first;
  });

  it('start() is idempotent and stop() clears the interval', () => {
    const setIntervalFn = vi.fn(
      () => 42 as unknown as ReturnType<typeof setInterval>,
    );
    const clearIntervalFn = vi.fn();
    const { wd } = makeWatchdog({ setIntervalFn, clearIntervalFn });
    wd.start();
    wd.start();
    expect(setIntervalFn).toHaveBeenCalledTimes(1);
    wd.stop();
    expect(clearIntervalFn).toHaveBeenCalledWith(42);
  });
});
