/**
 * Per-connection global inbound-op envelope (GCRA).
 *
 * The targeted per-second flood guard in `eventMiddleware.ts` only covers an
 * allowlist of known events; everything else (typing, collab cursors, future
 * handlers, unknown event names) is unmetered. This envelope caps the *total*
 * inbound op rate per connection so a misbehaving client is ejected instead of
 * throttled invisibly, while staying far above any legitimate client's rate.
 *
 * GCRA (generic cell rate algorithm) keeps O(1) state per connection — a single
 * theoretical-arrival-time (TAT) timestamp — instead of a sliding window of
 * timestamps. Sustained throughput converges to `opsPerMinute`; bursts up to a
 * full window's budget are tolerated before ops are refused.
 */

import { boundedInteger } from '../shared/numberParsing';
import { gcraStep } from '../shared/gcraRateLimiter';

const WINDOW_MS = 60_000;
const MIN_OPS_PER_MINUTE = 60;
const MAX_OPS_PER_MINUTE = 60_000;
const DEFAULT_OPS_PER_MINUTE = 1800;

/**
 * Sustained envelope budget from `ECHO_SOCKET_OPS_PER_MINUTE` (module-local env
 * tunable, same pattern as `echoAttentionSnapshotScheduler`). Defaults to 1800
 * ops/min — 30 ops/s sustained, far above any legitimate client.
 */
export function socketOpsPerMinuteFromEnv(raw: string | undefined): number {
  return boundedInteger(
    raw,
    DEFAULT_OPS_PER_MINUTE,
    MIN_OPS_PER_MINUTE,
    MAX_OPS_PER_MINUTE,
  );
}

export interface SocketOpEnvelope {
  /**
   * Records one inbound op. Returns `true` while the connection is within its
   * envelope; `false` means the budget is exhausted and the connection should
   * be ejected (the op is not admitted and does not consume budget).
   */
  admit(nowMs: number): boolean;
}

export function createSocketOpEnvelope(opts: {
  opsPerMinute: number;
}): SocketOpEnvelope {
  const opsPerMinute = Math.max(MIN_OPS_PER_MINUTE, opts.opsPerMinute);
  const emissionIntervalMs = WINDOW_MS / opsPerMinute;
  /** Single-key GCRA: one connection, full-window burst (`burstMs = WINDOW_MS`). */
  let tatMs = 0;

  return {
    admit(nowMs: number): boolean {
      const res = gcraStep(tatMs, nowMs, emissionIntervalMs, WINDOW_MS);
      if (!res.allowed) return false;
      tatMs = res.newTatMs;
      return true;
    },
  };
}
