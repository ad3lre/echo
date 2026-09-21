import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import {
  drainEchoWorkspaceEventOutbox,
  pruneEchoWorkspaceEventOutboxRows,
} from '../platform/echoPlatformEvents';

const OUTBOX_BATCH_SIZE = 100;

/** Replay workspace events left in processing state by an interrupted request. */
export function startEchoWorkspaceEventOutboxJob(
  fastify: FastifyInstance,
): NodeJS.Timeout | null {
  if (config.backendStorageMode !== 'postgres') return null;
  if (config.echoWorkspaceEventOutboxIntervalMs <= 0) {
    fastify.log.info(
      'Workspace-event outbox disabled (ECHO_WORKSPACE_EVENT_OUTBOX_MS=0)',
    );
    return null;
  }

  let running = false;
  let ticks = 0;
  const run = () => {
    if (running) return;
    running = true;
    ticks += 1;
    void drainEchoWorkspaceEventOutbox(fastify, OUTBOX_BATCH_SIZE)
      .then((result) => {
        if (result.delivered > 0 || result.failed > 0) {
          fastify.log.info(result, 'echo.workspace_event_outbox_drain');
        }
        if (ticks % 60 === 0) {
          return pruneEchoWorkspaceEventOutboxRows();
        }
        return 0;
      })
      .then((pruned) => {
        if (pruned > 0) {
          fastify.log.info({ pruned }, 'echo.workspace_event_outbox_pruned');
        }
      })
      .catch((error) => {
        fastify.log.error(error, 'echo.workspace_event_outbox_drain_failed');
      })
      .finally(() => {
        running = false;
      });
  };

  run();
  return setInterval(run, config.echoWorkspaceEventOutboxIntervalMs);
}
