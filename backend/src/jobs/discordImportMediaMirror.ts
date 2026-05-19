import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { getPgPool } from '../db/pg';
import { ensureEchoTables } from '../db/echoTables';
import { claimNextDiscordImportMediaMirrorJob } from '../services/discordImportMediaMirrorQueue';
import { processDiscordImportMediaMirrorJob } from '../services/discordImportMediaMirrorProcessor';

/**
 * Background job: copy Discord CDN attachments/embed media from imported messages into Echo storage
 * and rewrite URLs. Interval 0 disables.
 */
export function startDiscordImportMediaMirrorJob(
  fastify: FastifyInstance,
): NodeJS.Timeout | null {
  if (config.echoDiscordImportMediaMirrorIntervalMs <= 0) {
    fastify.log.info(
      'Discord import media mirror job disabled (ECHO_DISCORD_IMPORT_MEDIA_MIRROR_MS=0)',
    );
    return null;
  }
  const intervalMs = config.echoDiscordImportMediaMirrorIntervalMs;
  let running = false;
  return setInterval(() => {
    void (async () => {
      if (running) return;
      running = true;
      const pool = getPgPool();
      if (!pool) {
        running = false;
        return;
      }
      try {
        await ensureEchoTables(pool);
        const job = await claimNextDiscordImportMediaMirrorJob(pool);
        if (!job) {
          running = false;
          return;
        }
        await processDiscordImportMediaMirrorJob(
          pool,
          fastify.io,
          fastify.log,
          job,
        );
      } catch (e) {
        fastify.log.error(e, 'echo.discord_import_media_mirror.tick_failed');
      } finally {
        running = false;
      }
    })();
  }, intervalMs);
}
