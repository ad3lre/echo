import rateLimit from '@fastify/rate-limit';
import formbody from '@fastify/formbody';
import websocket from '@fastify/websocket';
import { FastifyInstance, FastifyRequest } from 'fastify';
import healthRoutes from './health';
import statusPageRoutes from './statusPage';
import giphyRoutes from './giphy';
import imageBrowseCategoriesRoutes from './imageBrowseCategories';
import serperImageSearchRoutes from './serperImageSearch';
import honchoMemoryRoutes from './honchoMemory';
import authRoutes from './auth';
import passkeyRoutes from './passkeyRoutes';
import discordOAuthRoutes from './discordOAuth';
import googleOAuthRoutes from './googleOAuth';
import appleOAuthRoutes from './appleOAuth';
import meDiscordRoutes from './meDiscord';
import meGoogleRoutes from './meGoogle';
import meYoutubeRoutes from './meYoutube';
import youtubeOAuthRoutes from './youtubeOAuth';
import discordBotHookRoutes from './discordBotHook';
import discordBridgeHookRoutes from './discordBridgeHook';
import discordVoiceMirrorHookRoutes from './discordVoiceMirrorHook';
import discordPresenceHookRoutes from './discordPresenceHook';
import livekitWebhookRoutes from './livekitWebhook';
import echoChannelWebhookHookRoutes from './echoChannelWebhookHook';
import analyticsRoutes from './analytics';
import clientEnvironmentAnalyticsRoutes from './clientEnvironmentAnalytics';
import devDiagnosticsRoutes from './devDiagnostics';
import agentNetworkDiagnosticsRoutes from './agentNetworkDiagnostics';
import gameOutboundRoutes from './internal/gameOutbound';
import echoRoutes from './echo';
import systemDeployCountdownRoutes from './systemDeployCountdown';
import systemInstancePolicyRoutes from './systemInstancePolicy';
import discordApiRoutes from './discordApi';
import discordGatewayRoutes from './discordApi/gateway';
import {
  CHANNEL_WEBHOOKS_ENABLED,
  GOOGLE_INTEGRATION_ENABLED,
  YOUTUBE_INTEGRATION_ENABLED,
} from '../../../../../contracts/integrationKillSwitches';
import { httpRateLimitStoreOpts } from '../../services/httpRateLimitStore';
import { globalHttpRateLimitKey } from '../globalRateLimitKey';
import {
  isAuthSessionReadRequest,
  isEchoApiReadRequest,
} from '../../bootstrap/echoReadRateLimitPaths';
import {
  resolveAuthSessionReadRateLimitMaxPerMinute,
  resolveEchoApiRateLimitMaxPerMinute,
} from '../../config/instancePolicy/resolveHttpRateLimit';

/**
 * Registers all REST API routes under /api/v1.
 * Routes are split by domain for maintainability.
 */
export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Register WebSocket plugin once at the top level so both gateway and any
  // future WS routes share the same plugin instance.
  await fastify.register(websocket);
  // Lets `/auth/*` and `/auth/discord/*` accept `application/x-www-form-urlencoded`
  // (CORS-simple POSTs; see `clients/web/src/api/authClient.ts`).
  await fastify.register(formbody);

  await fastify.register(healthRoutes, { prefix: '/api/v1' });
  await fastify.register(statusPageRoutes, { prefix: '/api/v1' });
  await fastify.register(systemDeployCountdownRoutes, { prefix: '/api/v1' });
  await fastify.register(systemInstancePolicyRoutes, { prefix: '/api/v1' });
  await fastify.register(giphyRoutes, { prefix: '/api/v1' });
  await fastify.register(imageBrowseCategoriesRoutes, { prefix: '/api/v1' });
  await fastify.register(serperImageSearchRoutes, { prefix: '/api/v1' });
  await fastify.register(honchoMemoryRoutes, { prefix: '/api/v1' });
  await fastify.register(
    async function authSessionReadRateLimitScope(instance) {
      await instance.register(rateLimit, {
        max: () => resolveAuthSessionReadRateLimitMaxPerMinute(),
        timeWindow: '1 minute',
        keyGenerator: globalHttpRateLimitKey,
        allowList: (req: FastifyRequest) =>
          !isAuthSessionReadRequest(req.method, req.url),
        addHeaders: { 'retry-after': true },
        ...httpRateLimitStoreOpts('echo-rl-auth-session-'),
      });
      await instance.register(authRoutes);
      await instance.register(passkeyRoutes);
      await instance.register(discordOAuthRoutes);
      await instance.register(appleOAuthRoutes);
      if (GOOGLE_INTEGRATION_ENABLED) {
        await instance.register(googleOAuthRoutes);
      }
      if (YOUTUBE_INTEGRATION_ENABLED) {
        await instance.register(youtubeOAuthRoutes);
      }
    },
    { prefix: '/api/v1/auth' },
  );
  if (GOOGLE_INTEGRATION_ENABLED) {
    await fastify.register(meGoogleRoutes, { prefix: '/api/v1' });
  }
  if (YOUTUBE_INTEGRATION_ENABLED) {
    await fastify.register(meYoutubeRoutes, { prefix: '/api/v1' });
  }
  await fastify.register(meDiscordRoutes, { prefix: '/api/v1' });
  await fastify.register(discordBotHookRoutes, { prefix: '/api/v1' });
  await fastify.register(discordBridgeHookRoutes, { prefix: '/api/v1' });
  await fastify.register(discordVoiceMirrorHookRoutes, { prefix: '/api/v1' });
  await fastify.register(discordPresenceHookRoutes, { prefix: '/api/v1' });
  await fastify.register(livekitWebhookRoutes, { prefix: '/api/v1' });
  if (CHANNEL_WEBHOOKS_ENABLED) {
    await fastify.register(echoChannelWebhookHookRoutes, { prefix: '/api/v1' });
  }
  await fastify.register(analyticsRoutes, { prefix: '/api/v1' });
  await fastify.register(clientEnvironmentAnalyticsRoutes, {
    prefix: '/api/v1',
  });
  await fastify.register(devDiagnosticsRoutes, { prefix: '/api/v1/dev' });
  await fastify.register(agentNetworkDiagnosticsRoutes, {
    prefix: '/api/v1/agent',
  });
  await fastify.register(gameOutboundRoutes, { prefix: '/api/v1' });
  await fastify.register(
    async function echoRateLimitScope(instance) {
      await instance.register(rateLimit, {
        max: () => resolveEchoApiRateLimitMaxPerMinute(),
        timeWindow: '1 minute',
        keyGenerator: globalHttpRateLimitKey,
        allowList: (req: FastifyRequest) =>
          !isEchoApiReadRequest(req.method, req.url),
        addHeaders: { 'retry-after': true },
        ...httpRateLimitStoreOpts('echo-rl-echo-api-'),
      });
      await instance.register(echoRoutes);
    },
    { prefix: '/api/v1/echo' },
  );

  // Discord-compatible REST API: bots point baseURL here
  await fastify.register(discordApiRoutes, { prefix: '/discord/v10' });

  // Discord Gateway WebSocket: bots point gateway URL here (/discord/gateway)
  await fastify.register(discordGatewayRoutes);

  fastify.log.info('Registered REST API routes');
}
