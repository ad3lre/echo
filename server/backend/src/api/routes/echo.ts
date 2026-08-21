import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import echoMessages from './echo/messages';
import echoMessageSearch from './echo/messageSearch';
import echoPublic from './echo/public';
import echoServers from './echo/servers';
import echoServerScoped from './echo/serverScoped';
import echoChannels from './echo/channels';
import echoPaper from './echo/paper';
import echoPermissionOverwrites from './echo/permissionOverwrites';
import echoCategories from './echo/categories';
import echoVoice from './echo/voice';
import echoGameServer from './echo/gameServer';
import echoStageYoutube from './echo/stageYoutube';
import echoVoiceE2ee from './echo/voiceE2ee';
import echoMls from './echo/mls';
import echoE2ee from './echo/e2ee';
import echoVcActivities from './echo/vcActivities';
import echoRoles from './echo/roles';
import echoInvites from './echo/invites';
import echoServerApplications from './echo/serverApplications';
import echoSocial from './echo/social';
import echoDm from './echo/dm';
import echoSafety from './echo/safety';
import echoUploads from './echo/uploads';
import echoMedia from './echo/media';
import echoModeration from './echo/moderation';
import echoBannedWords from './echo/bannedWords';
import echoEmojiLibrary from './echo/emojiLibrary';
import echoDiscordImport from './echo/discordImport';
import echoDiscordBridgeSettings from './echo/discordBridgeSettings';
import echoDiscordVoiceMirrorSettings from './echo/discordVoiceMirrorSettings';
import echoBugReports from './echo/bugReports';
import echoUserRingtones from './echo/userRingtones';
import echoBotApplications from './echo/botApplications';
import echoYoutubeSearch from './echo/youtubeSearch';
import echoChannelWebhooks from './echo/channelWebhooks';
import echoTickets from './echo/tickets';
import echoSelfAssignableRoles from './echo/selfAssignableRoles';
import echoInstanceBans from './echo/instanceBans';
import {
  CHANNEL_WEBHOOKS_ENABLED,
  YOUTUBE_INTEGRATION_ENABLED,
} from '../../../../../contracts/integrationKillSwitches';
import { registerEchoGuestWriteGuard } from './echo/guestWriteHook';
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
  // Upload reads include intentionally public server-branding and emoji objects.
  // The plugin applies authentication explicitly to every private upload route.
  await fastify.register(echoUploads);

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
