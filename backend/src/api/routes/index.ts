import rateLimit from '@fastify/rate-limit';
import formbody from '@fastify/formbody';
import websocket from '@fastify/websocket';
import { FastifyInstance, FastifyRequest } from 'fastify';
import healthRoutes from './health';
import statusPageRoutes from './statusPage';
import giphyRoutes from './giphy';
import serperImageSearchRoutes from './serperImageSearch';
import authRoutes from './auth';
import passkeyRoutes from './passkeyRoutes';
import discordOAuthRoutes from './discordOAuth';
import googleOAuthRoutes from './googleOAuth';
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
import devDiagnosticsRoutes from './devDiagnostics';
import agentNetworkDiagnosticsRoutes from './agentNetworkDiagnostics';
import echoRoutes from './echo';
import systemDeployCountdownRoutes from './systemDeployCountdown';
import discordApiRoutes from './discordApi';
import discordGatewayRoutes from './discordApi/gateway';
import { getAccessUserIdFromAuthHeader } from '../../auth/token';
import { isEchoApiReadRequest } from '../../bootstrap/echoReadRateLimitPaths';
import { config } from '../../config';

/**
 * Registers all REST API routes under /api/v1.
 * Routes are split by domain for maintainability.
 */
export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Register WebSocket plugin once at the top level so both gateway and any
  // future WS routes share the same plugin instance.
  await fastify.register(websocket);
  // Lets `/auth/*` and `/auth/discord/*` accept `application/x-www-form-urlencoded`
  // (CORS-simple POSTs from the Tauri WebView; see `frontend/src/api/authClient.ts`).
  await fastify.register(formbody);

  await fastify.register(healthRoutes, { prefix: '/api/v1' });
  await fastify.register(statusPageRoutes, { prefix: '/api/v1' });
  await fastify.register(systemDeployCountdownRoutes, { prefix: '/api/v1' });
  await fastify.register(giphyRoutes, { prefix: '/api/v1' });
  await fastify.register(serperImageSearchRoutes, { prefix: '/api/v1' });
  await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
  if (config.echoPasskeysEnabled) {
    await fastify.register(passkeyRoutes, { prefix: '/api/v1/auth' });
  }
  await fastify.register(discordOAuthRoutes, { prefix: '/api/v1/auth' });
  await fastify.register(googleOAuthRoutes, { prefix: '/api/v1/auth' });
  await fastify.register(youtubeOAuthRoutes, { prefix: '/api/v1/auth' });
  await fastify.register(meDiscordRoutes, { prefix: '/api/v1' });
  await fastify.register(meGoogleRoutes, { prefix: '/api/v1' });
  await fastify.register(meYoutubeRoutes, { prefix: '/api/v1' });
  await fastify.register(discordBotHookRoutes, { prefix: '/api/v1' });
  await fastify.register(discordBridgeHookRoutes, { prefix: '/api/v1' });
  await fastify.register(discordVoiceMirrorHookRoutes, { prefix: '/api/v1' });
  await fastify.register(discordPresenceHookRoutes, { prefix: '/api/v1' });
  await fastify.register(livekitWebhookRoutes, { prefix: '/api/v1' });
  await fastify.register(echoChannelWebhookHookRoutes, { prefix: '/api/v1' });
  await fastify.register(analyticsRoutes, { prefix: '/api/v1' });
  await fastify.register(devDiagnosticsRoutes, { prefix: '/api/v1/dev' });
  await fastify.register(agentNetworkDiagnosticsRoutes, {
    prefix: '/api/v1/agent',
  });
  await fastify.register(
    async function echoRateLimitScope(instance) {
      await instance.register(rateLimit, {
        max: 500,
        timeWindow: '1 minute',
        keyGenerator: (req) => {
          const userId = getAccessUserIdFromAuthHeader(
            req.headers.authorization,
          );
          return userId ? `uid:${userId}` : `ip:${req.ip}`;
        },
        allowList: (req: FastifyRequest) =>
          !isEchoApiReadRequest(req.method, req.url),
        addHeaders: { 'retry-after': true },
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
