/**
 * Shared in-process GCRA (Generic Cell Rate Algorithm) rate limiting.
 *
 * One algorithm for the socket layer's limiters (the per-connection op envelope and the
 * per-(user,channel) message limiter) instead of two bespoke implementations. GCRA keeps
 * **O(1) state per key** — a single theoretical-arrival-time (TAT) — rather than a growing
 * array of timestamps, and is naturally smooth (no edge-of-window burst). It is the same
 * algorithm Fluxer's `GcraRateLimiter` and most production limiters use.
 *
 * A "tier" is `{ limit, windowMs }` with **full-window burst**: the first `limit` hits in an
 * idle key are admitted instantly, then admission converges to `limit / windowMs`. A limiter
 * may have several tiers (e.g. burst 20/2s **and** 60/min); a hit is admitted only if every
 * tier admits, and a rejected hit consumes **no** budget in any tier.
 *
 * In-process only (per API process), consistent with Echo's single-node stance. The keyed
 * API is shaped so a shared-store (Valkey) backing could replace the `Map` later without
 * touching call sites — the §7 multi-node refinement.
 */

export type GcraTier = { limit: number; windowMs: number };

export type GcraDecision = {
  allowed: boolean;
  /** Milliseconds until the hit would be admitted (0 when allowed). */
  retryAfterMs: number;
};

type StepResult = { allowed: boolean; newTatMs: number; retryAfterMs: number };

/**
 * Pure GCRA step for one tier. `burstMs` is the burst tolerance; pass `burstMs = windowMs`
 * for "capacity = limit" (the first `limit` hits of an idle key admit instantly). Does not
 * mutate; the caller commits `newTatMs` only when every tier of a limiter admits.
 *
 * Uses the canonical form — compare the debt **before** adding the emission interval — so it
 * is robust to floating-point: when `windowMs / limit` is inexact (e.g. 1000/3), accumulating
 * `limit` emissions can drift just past `windowMs`, and the naive "after" comparison would
 * wrongly reject the `limit`-th hit. Comparing before adding the increment avoids that.
 */
export function gcraStep(
  tatMs: number,
  nowMs: number,
  emissionIntervalMs: number,
  burstMs: number,
): StepResult {
  const tatEffMs = Math.max(tatMs, nowMs);
  const aheadMs = tatEffMs - nowMs;
  if (aheadMs >= burstMs) {
    return {
      allowed: false,
      newTatMs: tatMs,
      retryAfterMs: aheadMs - burstMs + emissionIntervalMs,
    };
  }
  return {
    allowed: true,
    newTatMs: tatEffMs + emissionIntervalMs,
    retryAfterMs: 0,
  };
}

export interface KeyedGcraLimiter {
  /** Record one hit for `key`. Admitted iff every tier admits; rejection consumes no budget. */
  check(key: string, nowMs?: number): GcraDecision;
  /** Forget a key (e.g. an explicit reset). */
  reset(key: string): void;
  readonly size: number;
  /** Tests only. */
  clear(): void;
}

type TierParams = { emissionIntervalMs: number; burstMs: number };

const DEFAULT_MAX_KEYS = 50_000;
const CLEANUP_EVERY_MS = 60_000;

export function createGcraLimiter(
  tiers: GcraTier | GcraTier[],
  opts: { maxKeys?: number; getNowMs?: () => number } = {},
): KeyedGcraLimiter {
  const tierList = (Array.isArray(tiers) ? tiers : [tiers]).map(
    (t): TierParams => ({
      emissionIntervalMs: t.windowMs / Math.max(1, t.limit),
      burstMs: t.windowMs,
    }),
  );
  const maxKeys = opts.maxKeys ?? DEFAULT_MAX_KEYS;
  const now = opts.getNowMs ?? (() => Date.now());

  /** Per key: the TAT of each tier (parallel to `tierList`). */
  const state = new Map<string, number[]>();
  let lastCleanup = 0;

  /** An entry is removable once every tier's budget has fully recovered (tat <= now). */
  function prune(nowMs: number): void {
    if (nowMs - lastCleanup < CLEANUP_EVERY_MS && state.size <= maxKeys) return;
    lastCleanup = nowMs;
    for (const [key, tats] of state) {
      if (tats.every((tat) => tat <= nowMs)) state.delete(key);
    }
    while (state.size > maxKeys) {
      const oldest = state.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      state.delete(oldest);
    }
  }

  return {
    check(key: string, nowMs: number = now()): GcraDecision {
      prune(nowMs);
      const tats = state.get(key) ?? tierList.map(() => 0);

      let worstRetry = 0;
      const next: number[] = new Array(tierList.length);
      let allowed = true;
      for (let i = 0; i < tierList.length; i += 1) {
        const tier = tierList[i]!;
        const res = gcraStep(
          tats[i]!,
          nowMs,
          tier.emissionIntervalMs,
          tier.burstMs,
        );
        next[i] = res.newTatMs;
        if (!res.allowed) {
          allowed = false;
          if (res.retryAfterMs > worstRetry) worstRetry = res.retryAfterMs;
        }
      }

      if (!allowed) return { allowed: false, retryAfterMs: worstRetry };

      // Commit every tier only when all admitted.
      state.set(key, next);
      return { allowed: true, retryAfterMs: 0 };
    },
    reset(key: string): void {
      state.delete(key);
    },
    get size(): number {
      return state.size;
    },
    clear(): void {
      state.clear();
      lastCleanup = 0;
    },
  };
}
