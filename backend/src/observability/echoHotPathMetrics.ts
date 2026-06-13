/**
 * Hot-path SLI metrics layer.
 *
 * A focused set of latency/throughput/efficiency signals for the request-critical
 * paths that dominate Echo's per-message cost: the permission fold, the message
 * send (persist + broadcast), gateway fanout, and the in-RAM caches that back
 * them (permission fold cache + server permission aggregate). These complement
 * the coarse RED metrics in {@link ./echoMetrics} with the specific things we
 * tune for in docs/reviews/IN_MEMORY_SERVER_STATE_PLAN.md.
 *
 * All series register on the shared registry from {@link ./echoMetrics}, so they
 * are scraped at GET /api/v1/metrics and included in the weekly metrics digest
 * email without any extra wiring.
 */

import { Counter, Histogram } from 'prom-client';
import { getEchoMetricsRegistry } from './echoMetrics';

const registry = getEchoMetricsRegistry();

/** Sub-millisecond → tens-of-ms; folds/cache reads are expected to be fast. */
const FAST_PATH_BUCKETS = [
  0.0001, 0.00025, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25,
  0.5,
] as const;

/** The permission fold is `single` (one user/channel) or `batch` (many channels). */
export type EchoPermissionFoldMode = 'single' | 'batch';

/** Time to compute a user's effective permissions on a cache miss (the fold). */
export const echoPermissionFoldDurationSeconds = new Histogram({
  name: 'echo_permission_fold_duration_seconds',
  help: 'Wall time to fold effective permissions on a cache miss',
  labelNames: ['mode'],
  buckets: [...FAST_PATH_BUCKETS],
  registers: [registry],
});

/** Send transport, derived from the PG query-context scope. */
export type EchoMessageSendTransport = 'socket' | 'rest' | 'other';
export type EchoMessageSendResult = 'ok' | 'rejected' | 'error';

/** End-to-end persist + broadcast time for one chat message send. */
export const echoMessageSendDurationSeconds = new Histogram({
  name: 'echo_message_send_duration_seconds',
  help: 'End-to-end persist + broadcast time for a chat message send',
  labelNames: ['transport', 'result'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

/** PostgreSQL roundtrips issued while persisting + broadcasting one message. */
export const echoMessageSendDbQueries = new Histogram({
  name: 'echo_message_send_db_queries',
  help: 'PostgreSQL query roundtrips issued per message send (persist + broadcast)',
  labelNames: ['transport'],
  buckets: [0, 1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 50],
  registers: [registry],
});

/** Time to fan a realtime event out to a channel room via the socket adapter. */
export const echoGatewayFanoutDurationSeconds = new Histogram({
  name: 'echo_gateway_fanout_duration_seconds',
  help: 'Time to fan a realtime event out to a channel room (socket adapter publish)',
  labelNames: ['event'],
  buckets: [...FAST_PATH_BUCKETS],
  registers: [registry],
});

/** Hot in-RAM caches whose hit rate we track on the request-critical path. */
export type EchoHotCacheName = 'permission_fold' | 'server_aggregate';
export type EchoHotCacheOutcome = 'hit' | 'miss';

/** Hot-path cache accesses by cache and outcome — divide hit by (hit+miss). */
export const echoHotCacheAccessTotal = new Counter({
  name: 'echo_hot_cache_access_total',
  help: 'Hot-path cache accesses by cache and outcome (hit vs miss)',
  labelNames: ['cache', 'outcome'],
  registers: [registry],
});

/** How often the server permission aggregate is cold-loaded from Postgres. */
export const echoServerAggregateColdLoadTotal = new Counter({
  name: 'echo_server_aggregate_cold_load_total',
  help: 'Server permission aggregate cold loads (6-query DB read after a cache miss)',
  registers: [registry],
});

/** Record one hot-path cache access. */
export function recordHotCacheAccess(
  cache: EchoHotCacheName,
  outcome: EchoHotCacheOutcome,
): void {
  echoHotCacheAccessTotal.inc({ cache, outcome });
}

/**
 * Time an async fold and observe it under {@link echoPermissionFoldDurationSeconds}.
 * Records on both success and failure so error latency is not silently dropped.
 */
export async function timePermissionFold<T>(
  mode: EchoPermissionFoldMode,
  fold: () => Promise<T>,
): Promise<T> {
  const end = echoPermissionFoldDurationSeconds.startTimer({ mode });
  try {
    return await fold();
  } finally {
    end();
  }
}
