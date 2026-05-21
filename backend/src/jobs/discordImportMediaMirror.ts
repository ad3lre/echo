import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import {
  registerDiscordImportMediaMirrorRuntime,
  runDiscordImportMediaMirrorDrain,
} from '../services/discordImportMediaMirrorScheduler';

/**
 * Background job: copy Discord CDN attachments/embed media from imported/synced messages
 * into Echo storage and rewrite URLs. Messages are stored with Discord CDN URLs first
 * (instant display); this job rehosts and pushes `message:media_mirror` updates. Interval 0 disables.
 */
export function startDiscordImportMediaMirrorJob(
  fastify: FastifyInstance,
): NodeJS.Timeout | null {
  registerDiscordImportMediaMirrorRuntime(fastify.io, fastify.log);
  if (config.echoDiscordImportMediaMirrorIntervalMs <= 0) {
    fastify.log.info(
      'Discord import media mirror job disabled (ECHO_DISCORD_IMPORT_MEDIA_MIRROR_MS=0)',
    );
    return null;
  }
  const intervalMs = config.echoDiscordImportMediaMirrorIntervalMs;
  return setInterval(() => {
    void runDiscordImportMediaMirrorDrain(fastify.log);
  }, intervalMs);
}
