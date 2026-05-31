import type pg from 'pg';
import { runEchoVideoHlsDrainTick, type EchoVideoHlsLog } from './drain';

export type EchoVideoHlsScheduler = {
  kick: () => void;
  /** Stops the poll interval; in-flight drain may continue until {@link whenIdle}. */
  stop: () => void;
  /** Resolves when no drain tick is running (optional timeout logs and resolves anyway). */
  whenIdle: (timeoutMs?: number) => Promise<void>;
};

/**
 * Interval-driven drain with in-process kick (embedded API or standalone worker).
 */
export function createEchoVideoHlsScheduler(opts: {
  intervalMs: number;
  log: EchoVideoHlsLog;
  getPool: () => pg.Pool | null;
  runOnStart?: boolean;
}): EchoVideoHlsScheduler | null {
  if (opts.intervalMs <= 0) return null;

  let stopped = false;
  let running = false;
  let rerunRequested = false;
  let timer: NodeJS.Timeout | null = null;
  let activeWork: Promise<void> | null = null;

  const run = (): void => {
    if (stopped) return;
    if (activeWork) {
      rerunRequested = true;
      return;
    }
    activeWork = (async () => {
      running = true;
      const pool = opts.getPool();
      if (!pool) {
        running = false;
        activeWork = null;
        return;
      }
      try {
        do {
          rerunRequested = false;
          await runEchoVideoHlsDrainTick(pool, opts.log);
        } while (rerunRequested && !stopped);
      } catch (e) {
        opts.log.error(e, 'echo.video_hls.tick_failed');
      } finally {
        running = false;
        activeWork = null;
      }
    })();
  };

  const kick = (): void => {
    if (stopped) return;
    run();
  };

  timer = setInterval(kick, opts.intervalMs);
  if (opts.runOnStart !== false) {
    kick();
  }

  return {
    kick,
    stop: () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    whenIdle: async (timeoutMs?: number): Promise<void> => {
      if (!activeWork && !running) return;
      const wait =
        activeWork ??
        new Promise<void>((resolve) => {
          const poll = (): void => {
            if (!running && !activeWork) resolve();
            else setTimeout(poll, 50);
          };
          poll();
        });
      if (timeoutMs == null || timeoutMs <= 0) {
        await wait;
        return;
      }
      let timedOut = false;
      await Promise.race([
        wait,
        new Promise<void>((resolve) => {
          setTimeout(() => {
            timedOut = true;
            resolve();
          }, timeoutMs);
        }),
      ]);
      if (timedOut) {
        opts.log.warn({ timeoutMs }, 'echo.video_hls.shutdown_idle_timeout');
      }
    },
  };
}
