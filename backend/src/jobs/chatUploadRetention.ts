import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { getPgPool } from '../db/pg';
import {
  claimChatUploadRetentionPurgeBatch,
  markChatUploadRetentionPurged,
  markChatUploadRetentionPurgeFailed,
} from '../services/chatUploadRetention';
import { purgeEchoUploadObject } from '../services/csamScan';

async function runChatUploadRetentionPurge(
  fastify: FastifyInstance,
): Promise<void> {
  if (config.backendStorageMode !== 'postgres') return;
  const pool = getPgPool();
  if (!pool) return;

  const batchSize = config.echoChatUploadRetentionBatchSize;
  const keys = await claimChatUploadRetentionPurgeBatch(pool, batchSize);
  if (keys.length === 0) return;

  let purged = 0;
  let failed = 0;

  for (const storageKey of keys) {
    try {
      await purgeEchoUploadObject(storageKey);
      await markChatUploadRetentionPurged(pool, storageKey);
      purged += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await markChatUploadRetentionPurgeFailed(pool, storageKey, msg);
      failed += 1;
      fastify.log.warn(
        {
          storage_key_head: storageKey.slice(0, 28),
          err: msg,
        },
        'chat_upload_retention_purge_failed',
      );
    }
  }

  if (purged > 0 || failed > 0) {
    fastify.log.info(
      { purged, failed, claimed: keys.length },
      'chat_upload_retention_purge',
    );
  }
}

export function startChatUploadRetentionJob(fastify: FastifyInstance): void {
  const intervalMs = config.echoChatUploadRetentionIntervalMs;
  if (intervalMs <= 0) return;

  const run = () => {
    void runChatUploadRetentionPurge(fastify).catch((err) => {
      fastify.log.error(err, 'chat_upload_retention_purge_job_failed');
    });
  };

  run();
  setInterval(run, intervalMs);
}
