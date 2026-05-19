import fs from 'fs/promises';
import path from 'path';
import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { isDiscordOauthConfigured } from '../domain/discordOAuthRedirect';
import { getEchoStore } from '../domain/echoStore/bootstrap';
import { registerRoutes } from '../api/routes';
import {
  registerHttpPlugins,
  registerHttpsEnforcementIfConfigured,
} from './httpPlugins';
import { attachSocketAdapterIfConfigured } from './socket';
import type { Server } from 'socket.io';
import { startPresenceSweepJob } from '../jobs/presenceSweep';
import { startLoginEventsRetentionJob } from '../jobs/loginEventsRetention';
import { startMessageAutoDeleteRetentionJob } from '../jobs/messageAutoDeleteRetention';
import { startVideoUploadOptimizeJob } from '../jobs/videoUploadOptimize';
import { startDiscordImportMediaMirrorJob } from '../jobs/discordImportMediaMirror';
import { startEchoVoiceRosterReconcileJob } from '../jobs/voiceRosterReconcile';
import { getPgPool } from '../db/pg';
import { reconcileEchoVoiceParticipantsAgainstLiveKit } from '../services/echoVoiceLiveKitReconcile';
import {
  closeSessionDiagnostics,
  initSessionDiagnostics,
} from '../observability/sessionDiagnostics';

export async function startServer(
  fastify: FastifyInstance,
  io: Server,
): Promise<void> {
  if (config.echoSessionDiagnostics) {
    await initSessionDiagnostics(
      path.resolve(process.cwd(), '.diagnostics/sessions'),
    );
    fastify.addHook('onClose', async () => {
      await closeSessionDiagnostics('closed');
    });
  }
  if (config.backendStorageMode === 'postgres') {
    // Fail fast in postgres mode: validate DB availability + schema at boot.
    await getEchoStore();
  }
  if (config.echoLocalUploadDir) {
    await fs.mkdir(config.echoLocalUploadDir, { recursive: true });
  }
  if (config.echoCsamImageScanEffective === 'on') {
    fastify.log.info(
      {
        echo_csam: 'scanners_active',
        mode: config.echoCsamImageScanMode,
      },
      'echo.csam.scanners_active',
    );
  }
  await attachSocketAdapterIfConfigured(fastify, io);
  await registerHttpPlugins(fastify);
  registerHttpsEnforcementIfConfigured(fastify);
  await registerRoutes(fastify);

  startPresenceSweepJob(fastify);
  startLoginEventsRetentionJob(fastify);
  startMessageAutoDeleteRetentionJob(fastify);
  startVideoUploadOptimizeJob(fastify);
  startDiscordImportMediaMirrorJob(fastify);
  startEchoVoiceRosterReconcileJob(fastify);

  if (config.backendStorageMode === 'postgres') {
    const pool = getPgPool();
    if (pool) {
      try {
        const res = await reconcileEchoVoiceParticipantsAgainstLiveKit({
          fastify,
          pool,
          reason: 'boot',
          log: fastify.log,
        });
        if (res.deletedRows > 0 || res.skipped) {
          fastify.log.info(
            {
              deletedRows: res.deletedRows,
              affectedServers: res.affectedServers,
              checkedGroups: res.checkedGroups,
              liveKitChecked: res.liveKitChecked,
              liveKitReachable: res.liveKitReachable,
              skipped: res.skipped ?? null,
            },
            'echo.voice.boot_reconcile',
          );
        }
      } catch (e) {
        fastify.log.error(e, 'echo.voice.boot_reconcile_failed');
      }
    }
  }

  await fastify.listen({ port: config.port, host: config.host });
  fastify.log.info(
    `Backend server listening on http://${config.host}:${config.port}`,
  );
  if (config.backendStorageMode === 'postgres' && !isDiscordOauthConfigured()) {
    fastify.log.warn(
      'Discord user OAuth (account linking) is disabled: set DISCORD_OAUTH_CLIENT_ID, DISCORD_OAUTH_CLIENT_SECRET, and DISCORD_OAUTH_REDIRECT_URI on this process (repo root .env for local dev). DISCORD_BOT_TOKEN does not enable linking.',
    );
  }
  if (config.backendStorageMode === 'postgres' && isDiscordOauthConfigured()) {
    fastify.log.info(
      {
        discordOAuthRedirectUri: config.discordOauthRedirectUri,
      },
      'Discord OAuth: add this exact URL to Discord Developer Portal → OAuth2 → Redirects (invalid redirect_uri = mismatch)',
    );
  }
  if (config.backendStorageMode === 'memory') {
    fastify.log.info(
      'Using in-memory Echo store (ECHO_BACKEND_STORAGE=memory)',
    );
  }
  if (config.liveKitEnabled) {
    fastify.log.info(`[LiveKit] ✓ enabled — url=${config.liveKitPublicUrl}`);
  } else {
    fastify.log.info(
      '[LiveKit] ✗ disabled — set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_PUBLIC_URL to enable',
    );
  }
}
