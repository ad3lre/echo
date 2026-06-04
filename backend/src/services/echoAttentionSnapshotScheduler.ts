import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import type { Server } from 'socket.io';
import {
  buildEchoAttentionSnapshot,
  buildEchoChannelAttentionFanoutDeltas,
} from '../domain/echoStore';
import { runWithPgQueryContext } from '../db/pgQueryContext';
import { emitEchoReadStateUpdate } from './echoAttentionRealtime';

const DEBOUNCE_MS = Math.max(
  0,
  Number(process.env.ECHO_ATTENTION_SNAPSHOT_DEBOUNCE_MS) || 150,
);

export type EchoAttentionFanoutScope =
  | { mode: 'full' }
  | { mode: 'channel'; channelId: string; serverId?: string | null };

type PendingFlush = {
  pool: pg.Pool;
  io: Server;
  scope: EchoAttentionFanoutScope;
  userIds: Set<string>;
  log?: FastifyBaseLogger;
  timer: ReturnType<typeof setTimeout> | null;
};

const pendingByKey = new Map<string, PendingFlush>();

function pendingKey(pool: pg.Pool, scope: EchoAttentionFanoutScope): string {
  const base =
    (pool as { options?: { connectionString?: string } }).options
      ?.connectionString ?? 'default';
  if (scope.mode === 'full') return `full:${base}`;
  return `ch:${base}:${scope.channelId}`;
}

async function flushPending(entry: PendingFlush): Promise<void> {
  entry.timer = null;
  const userIds = [...entry.userIds];
  entry.userIds.clear();
  if (userIds.length === 0) return;

  if (entry.scope.mode === 'channel') {
    const { channelId, serverId } = entry.scope;
    await runWithPgQueryContext(
      { scope: 'internal', label: 'attention_channel_delta_batch' },
      async () => {
        try {
          const deltas = await buildEchoChannelAttentionFanoutDeltas(
            entry.pool,
            channelId,
            userIds,
            { serverId },
          );
          for (const delta of deltas) {
            emitEchoReadStateUpdate(
              entry.io,
              delta.userId,
              channelId,
              delta.lastReadMessageId,
              delta.channelAttention,
            );
          }
        } catch (err) {
          entry.log?.error(
            { err, channelId },
            'emit channel attention deltas failed',
          );
        }
      },
    );
    return;
  }

  await runWithPgQueryContext(
    { scope: 'internal', label: 'attention_snapshot_batch' },
    async () => {
      for (const userId of userIds) {
        try {
          const snapshot = await buildEchoAttentionSnapshot(entry.pool, userId);
          entry.io.to(`echo:user:${userId}`).emit('attention:update', snapshot);
        } catch (err) {
          entry.log?.error({ err, userId }, 'emit attention snapshot failed');
        }
      }
    },
  );
}

/**
 * Debounce attention updates per user. Prefer `{ mode: 'channel', channelId }`
 * after message activity so clients merge unread via `read_state:update`.
 */
export function scheduleEchoAttentionSnapshotsForUsers(
  pool: pg.Pool,
  io: Server,
  userIds: Iterable<string>,
  log?: FastifyBaseLogger,
  scope?: EchoAttentionFanoutScope,
): void {
  const resolvedScope: EchoAttentionFanoutScope =
    scope?.mode === 'channel' && scope.channelId.trim()
      ? {
          mode: 'channel',
          channelId: scope.channelId.trim(),
          serverId: scope.serverId ?? null,
        }
      : { mode: 'full' };

  const key = pendingKey(pool, resolvedScope);
  let entry = pendingByKey.get(key);
  if (!entry) {
    entry = {
      pool,
      io,
      scope: resolvedScope,
      userIds: new Set(),
      log,
      timer: null,
    };
    pendingByKey.set(key, entry);
  }
  for (const userId of userIds) {
    const trimmed = userId.trim();
    if (trimmed) entry.userIds.add(trimmed);
  }
  if (entry.timer) return;
  if (DEBOUNCE_MS <= 0) {
    void flushPending(entry);
    return;
  }
  entry.timer = setTimeout(() => {
    void flushPending(entry!);
  }, DEBOUNCE_MS);
  if (typeof entry.timer.unref === 'function') entry.timer.unref();
}

/** Test hook: drain all pending debounced attention flushes. */
export async function flushEchoAttentionSnapshotSchedulerForTests(): Promise<void> {
  const entries = [...pendingByKey.values()];
  for (const entry of entries) {
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    await flushPending(entry);
  }
  pendingByKey.clear();
}
