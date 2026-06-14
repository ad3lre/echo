import type { RoomManager } from './RoomManager';

export interface TickSchedulerOpts {
  manager: RoomManager;
  idleDisposeMs: number;
  /** Base loop interval; timed games are advanced on this cadence. */
  baseIntervalMs?: number;
  now?: () => number;
}

/**
 * Single timer that advances all timed instances and reaps idle ones. v1 games
 * are turn-based or 1 Hz countdowns, so one shared 250ms loop is ample; future
 * action games can raise their `tickHz` and we shorten the base interval.
 */
export function startTickScheduler(opts: TickSchedulerOpts): () => void {
  const base = opts.baseIntervalMs ?? 250;
  const now = opts.now ?? (() => Date.now());
  const timer = setInterval(() => {
    const t = now();
    opts.manager.tickAll(t);
    opts.manager.sweepIdle(t, opts.idleDisposeMs);
  }, base);
  // Don't keep the process alive solely for the tick loop.
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}
