import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { getAuthStore } from '../auth/store';

export function startLoginEventsRetentionJob(fastify: FastifyInstance): void {
  const intervalMs = config.echoLoginEventsRetentionIntervalMs;
  if (intervalMs <= 0) return;

  const run = async () => {
    try {
      const { store, mode } = await getAuthStore();
      if (mode !== 'postgres') return;
      const n = await store.pruneLoginEvents(
        config.echoLoginEventsRetentionDays,
      );
      if (n > 0) {
        fastify.log.info(
          { n, days: config.echoLoginEventsRetentionDays },
          'login_events_pruned',
        );
      }
    } catch (err) {
      fastify.log.error(err, 'login_events_prune_failed');
    }
  };

  void run();
  setInterval(() => {
    void run();
  }, intervalMs);
}
