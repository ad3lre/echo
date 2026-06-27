import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import echoMessages from './echo/echoMessages';
import echoMessageSearch from './echo/echoMessageSearch';
import echoPublic from './echo/echoPublic';
import echoServers from './echo/echoServers';
import echoServerScoped from './echo/echoServerScoped';
import echoChannels from './echo/echoChannels';
import echoPaper from './echo/echoPaper';
import echoPermissionOverwrites from './echo/echoPermissionOverwrites';
import echoCategories from './echo/echoCategories';
import echoVoice from './echo/echoVoice';
import echoGameServer from './echo/echoGameServer';
import echoStageYoutube from './echo/echoStageYoutube';
import echoVoiceE2ee from './echo/echoVoiceE2ee';
import echoMls from './echo/echoMls';
import echoE2ee from './echo/echoE2ee';
import echoVcActivities from './echo/echoVcActivities';
import echoRoles from './echo/echoRoles';
import echoInvites from './echo/echoInvites';
import echoServerApplications from './echo/echoServerApplications';
import echoSocial from './echo/echoSocial';
import echoDm from './echo/echoDm';
import echoSafety from './echo/echoSafety';
import echoUploads from './echo/echoUploads';
import echoMedia from './echo/echoMedia';
import echoModeration from './echo/echoModeration';
import echoBannedWords from './echo/echoBannedWords';
import echoEmojiLibrary from './echo/echoEmojiLibrary';
import echoDiscordImport from './echo/echoDiscordImport';
import echoDiscordBridgeSettings from './echo/echoDiscordBridgeSettings';
import echoDiscordVoiceMirrorSettings from './echo/echoDiscordVoiceMirrorSettings';
import echoBugReports from './echo/echoBugReports';
import echoUserRingtones from './echo/echoUserRingtones';
import echoBotApplications from './echo/echoBotApplications';
import echoYoutubeSearch from './echo/echoYoutubeSearch';
import echoChannelWebhooks from './echo/echoChannelWebhooks';
import echoTickets from './echo/echoTickets';
import echoSelfAssignableRoles from './echo/echoSelfAssignableRoles';
import echoInstanceBans from './echo/echoInstanceBans';
import {
  CHANNEL_WEBHOOKS_ENABLED,
  YOUTUBE_INTEGRATION_ENABLED,
} from '../../../../shared/integrationKillSwitches';
import { registerEchoGuestWriteGuard } from './echo/echoGuestWriteHook';
import { sendError } from '../errors';
import { requireAuth } from '../../auth/middleware';

/**
 * Echo REST API: composes feature-scoped route plugins under `/api/v1/echo`.
 */
export default async function echoRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.addHook('preHandler', async (req, reply) => {
    const p = req.params as Record<string, unknown> | undefined;
    if (!p || typeof p !== 'object') return;
    for (const v of Object.values(p)) {
      if (typeof v === 'string' && v.trim() === '') {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Path parameter cannot be empty or whitespace-only',
        );
      }
    }
  });
  await fastify.register(echoPublic);
  await fastify.register(echoMedia);

  await fastify.register(async (secured) => {
    secured.addHook('preHandler', requireAuth);
    await secured.register(echoMessages);
    await secured.register(echoMessageSearch);
    await secured.register(echoServers);
    await secured.register(echoServerScoped);
    await secured.register(echoChannels);
    await secured.register(echoPaper);
    await secured.register(echoPermissionOverwrites);
    await secured.register(echoCategories);
    await secured.register(echoVoice);
    await secured.register(echoGameServer);
    if (YOUTUBE_INTEGRATION_ENABLED) {
      await secured.register(echoStageYoutube);
    }
    await secured.register(echoVoiceE2ee);
    await secured.register(echoMls);
    await secured.register(echoE2ee);
    await secured.register(echoVcActivities);
    await secured.register(echoRoles);
    await secured.register(echoInvites);
    await secured.register(echoServerApplications);
    await secured.register(echoSocial);
    await secured.register(echoDm);
    await secured.register(echoSafety);
    await secured.register(echoUploads);
    await secured.register(echoModeration);
    await secured.register(echoBannedWords);
    await secured.register(echoEmojiLibrary);
    await secured.register(echoDiscordImport);
    await secured.register(echoDiscordBridgeSettings);
    await secured.register(echoDiscordVoiceMirrorSettings);
    if (CHANNEL_WEBHOOKS_ENABLED) {
      await secured.register(echoChannelWebhooks);
    }
    await secured.register(echoTickets);
    await secured.register(echoSelfAssignableRoles);
    await secured.register(echoBugReports);
    await secured.register(echoUserRingtones);
    await secured.register(echoBotApplications);
    await secured.register(echoInstanceBans, { prefix: '/instance' });
    if (YOUTUBE_INTEGRATION_ENABLED) {
      await secured.register(echoYoutubeSearch);
    }
    registerEchoGuestWriteGuard(secured);
  });
}
