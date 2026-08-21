import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import { config } from '../config';
import { getPgPool } from '../db/pg';
import {
  ECHO_MESSAGE_DELETED_COMPLIANCE_RETENTION_DAYS,
  listEchoChannelsWithEffectiveAutoDelete,
} from '../domain/echoStore/messages/messageAutoDelete';
import {
  purgeEchoMessagesDeletedBefore,
  softDeleteEchoMessagesOlderThanInChannel,
} from '../domain/echoMessagesDal';
import { broadcastToEchoChannel } from '../sockets/channelBroadcast';

const AUTO_DELETE_BATCH = 500;
const COMPLIANCE_PURGE_BATCH = 2000;

async function runMessageAutoDeleteRetention(
  fastify: FastifyInstance,
  io: Server | undefined,
): Promise<void> {
  if (config.backendStorageMode !== 'postgres') return;
  const pool = getPgPool();
  if (!pool) return;

  const channels = await listEchoChannelsWithEffectiveAutoDelete(pool);
  const now = Date.now();
  let softDeleted = 0;

  for (const ch of channels) {
    const cutoff = new Date(now - ch.effectiveSeconds * 1000);
    const rows = await softDeleteEchoMessagesOlderThanInChannel(
      pool,
      ch.channelId,
      cutoff,
      AUTO_DELETE_BATCH,
    );
    if (rows.length === 0) continue;
    softDeleted += rows.length;
    if (io) {
      for (const row of rows) {
        broadcastToEchoChannel(io, row.channelId, 'message:deleted', {
          channelId: row.channelId,
          messageId: row.id,
        });
      }
    }
  }

  const complianceDays =
    config.echoMessageDeletedComplianceRetentionDays ??
    ECHO_MESSAGE_DELETED_COMPLIANCE_RETENTION_DAYS;
  const purgeBefore = new Date(now - complianceDays * 24 * 60 * 60 * 1000);
  const purged = await purgeEchoMessagesDeletedBefore(
    pool,
    purgeBefore,
    COMPLIANCE_PURGE_BATCH,
  );

  if (softDeleted > 0 || purged > 0) {
    fastify.log.info(
      { softDeleted, purged, channelCount: channels.length, complianceDays },
      'message_auto_delete_retention',
    );
  }
}

export function startMessageAutoDeleteRetentionJob(
  fastify: FastifyInstance,
): void {
  const intervalMs = config.echoMessageAutoDeleteRetentionIntervalMs;
  if (intervalMs <= 0) return;

  const run = () => {
    void runMessageAutoDeleteRetention(fastify, fastify.io).catch((err) => {
      fastify.log.error(err, 'message_auto_delete_retention_failed');
    });
  };

  run();
  setInterval(run, intervalMs);
}
