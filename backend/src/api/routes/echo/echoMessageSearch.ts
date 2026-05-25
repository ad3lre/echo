import rateLimit from '@fastify/rate-limit';
import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
} from 'fastify';
import { getAuthUser, requireAuth } from '../../../auth/middleware';
import { getAccessUserIdFromAuthHeader } from '../../../auth/token';
import { isMemberOfServer } from '../../../domain/echoPermissions';
import { redactAnonymousPollsInEchoMessageRows } from '../../../domain/echoMessagePollRedaction';
import {
  diagnoseEchoChannelAccess,
  listEchoChannels,
  searchEchoMessagesInChannels,
  type EchoMessageSearchHasType,
} from '../../../domain/echoStore';
import { batchGetEffectiveChannelPermissions } from '../../../domain/echoStore/permissions';
import {
  echoMessageSearchDurationSeconds,
  echoMessageSearchResultCount,
} from '../../../observability/echoMetrics';
import {
  ECHO_MSG_NOT_SERVER_MEMBER,
  sendEchoChannelAccessDenied,
  sendError,
} from '../../errors';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

const HAS_TYPES = new Set<string>([
  'image',
  'gif',
  'link',
  'video',
  'audio',
  'docs',
]);

function parseHasType(
  raw: string | undefined,
): EchoMessageSearchHasType | undefined {
  if (raw == null || raw === '') return undefined;
  const t = raw.toLowerCase();
  if (!HAS_TYPES.has(t)) return undefined;
  return t as EchoMessageSearchHasType;
}

async function listSearchableTextChannelIds(
  pool: import('pg').Pool,
  serverId: string,
  userId: string,
): Promise<string[]> {
  const chans = await listEchoChannels(pool, serverId);
  const textChannels = chans.filter((ch) => ch.type !== 'voice');
  if (textChannels.length === 0) return [];

  const channelIds = textChannels.map((ch) => ch.id);
  const permsMap = await batchGetEffectiveChannelPermissions(
    pool,
    serverId,
    userId,
    channelIds,
  );
  return channelIds.filter((id) => {
    const perms = permsMap.get(id);
    return perms != null && perms.has('VIEW_CHANNEL');
  });
}

type SearchQs = {
  q?: string;
  channelId?: string;
  authorId?: string;
  mentions?: string;
  before?: string;
  limit?: string;
  hasType?: string;
  hasAttachment?: string;
};

function parseHasAttachment(raw: string | undefined): boolean {
  if (raw == null || raw === '') return false;
  const s = raw.toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

function validateSearchCriteria(
  qs: SearchQs,
):
  | { ok: true }
  | { ok: false; reply: (reply: import('fastify').FastifyReply) => void } {
  const q = typeof qs.q === 'string' ? qs.q.trim() : '';
  const hasType = parseHasType(qs.hasType);
  const hasAttachment = parseHasAttachment(qs.hasAttachment);
  const authorId = typeof qs.authorId === 'string' ? qs.authorId.trim() : '';
  const mentions = typeof qs.mentions === 'string' ? qs.mentions.trim() : '';
  if (
    qs.hasType != null &&
    qs.hasType !== '' &&
    parseHasType(qs.hasType) == null
  ) {
    return {
      ok: false,
      reply: (reply) =>
        sendError(reply, 400, 'INVALID_QUERY', 'Invalid hasType'),
    };
  }

  const hasQ = q.length >= 1;
  const hasAuthor = authorId.length > 0;
  const hasMention = mentions.length > 0;
  const hasHas = hasType != null;

  if (!hasQ && !hasAuthor && !hasMention && !hasHas && !hasAttachment) {
    return {
      ok: false,
      reply: (reply) =>
        sendError(
          reply,
          400,
          'SEARCH_QUERY_REQUIRED',
          'Provide q, hasType, hasAttachment, authorId, or mentions',
        ),
    };
  }

  return { ok: true };
}

export default async function echoMessageSearchRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 60,
      timeWindow: '1 minute',
      keyGenerator: (req: FastifyRequest) => {
        const uid = getAccessUserIdFromAuthHeader(req.headers.authorization);
        return uid ? `echo_msg_search:${uid}` : `echo_msg_search:ip:${req.ip}`;
      },
      addHeaders: { 'retry-after': true },
    });

    scope.get<{ Params: { serverId: string }; Querystring: SearchQs }>(
      '/servers/:serverId/messages/search',
      { preHandler: [requireAuth, requireEchoStore] },
      async (req, reply) => {
        const pool = echoPool(req);
        const serverId = trimEchoPathParam(req.params.serverId);
        const userId = getAuthUser(req).id;
        const v = validateSearchCriteria(req.query);
        if (!v.ok) return v.reply(reply);

        const mem = await isMemberOfServer(pool, serverId, userId);
        if (!mem)
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            ECHO_MSG_NOT_SERVER_MEMBER,
            'NOT_SERVER_MEMBER',
          );

        const allowed = await listSearchableTextChannelIds(
          pool,
          serverId,
          userId,
        );
        if (allowed.length === 0) return reply.code(200).send({ messages: [] });

        let filterChannelId: string | undefined =
          typeof req.query.channelId === 'string'
            ? req.query.channelId.trim()
            : undefined;
        if (filterChannelId && !allowed.includes(filterChannelId)) {
          const d = await diagnoseEchoChannelAccess(
            pool,
            userId,
            filterChannelId,
          );
          if (!d.ok) return sendEchoChannelAccessDenied(reply, d);
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'You cannot include this channel in search (it is not a text channel you can access, or it is in another server).',
            'CHANNEL_NOT_SEARCHABLE',
          );
        }

        const limit = Math.min(
          50,
          Math.max(1, parseInt(req.query.limit ?? '24', 10) || 24),
        );
        const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        const authorId =
          typeof req.query.authorId === 'string'
            ? req.query.authorId.trim()
            : undefined;
        const mentions =
          typeof req.query.mentions === 'string'
            ? req.query.mentions.trim()
            : undefined;
        const before =
          typeof req.query.before === 'string'
            ? req.query.before.trim()
            : undefined;
        const hasType = parseHasType(req.query.hasType);
        const hasAttachment = parseHasAttachment(req.query.hasAttachment);

        const t0 = process.hrtime.bigint();
        try {
          const rows = await searchEchoMessagesInChannels(pool, {
            channelIds: allowed,
            ...(q.length >= 1 ? { q } : {}),
            ...(authorId ? { authorId } : {}),
            ...(filterChannelId ? { channelId: filterChannelId } : {}),
            ...(mentions ? { mentionSubstr: mentions } : {}),
            ...(before ? { before } : {}),
            limit,
            ...(hasType ? { hasType } : {}),
            ...(hasAttachment ? { hasAttachment: true } : {}),
          });
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          echoMessageSearchDurationSeconds.labels('server').observe(ms / 1000);
          echoMessageSearchResultCount.labels('server').observe(rows.length);
          req.log.info({
            msg: 'echo.rest.messages_search',
            scope: 'server',
            serverId,
            userId,
            durationMs: Math.round(ms),
            resultCount: rows.length,
          });
          return reply.code(200).send({
            messages: redactAnonymousPollsInEchoMessageRows(rows, userId),
          });
        } catch (err) {
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          echoMessageSearchDurationSeconds.labels('server').observe(ms / 1000);
          req.log.error({ err, serverId }, 'echo.rest.messages_search_failed');
          return sendError(reply, 500, 'INTERNAL_ERROR', 'Search failed');
        }
      },
    );

    scope.get<{ Params: { channelId: string }; Querystring: SearchQs }>(
      '/channels/:channelId/messages/search',
      { preHandler: [requireAuth, requireEchoStore] },
      async (req, reply) => {
        const pool = echoPool(req);
        const channelId = trimEchoPathParam(req.params.channelId);
        const userId = getAuthUser(req).id;
        const v = validateSearchCriteria(req.query);
        if (!v.ok) return v.reply(reply);

        const access = await diagnoseEchoChannelAccess(pool, userId, channelId);
        if (!access.ok) return sendEchoChannelAccessDenied(reply, access);

        const limit = Math.min(
          50,
          Math.max(1, parseInt(req.query.limit ?? '24', 10) || 24),
        );
        const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        const authorId =
          typeof req.query.authorId === 'string'
            ? req.query.authorId.trim()
            : undefined;
        const mentions =
          typeof req.query.mentions === 'string'
            ? req.query.mentions.trim()
            : undefined;
        const before =
          typeof req.query.before === 'string'
            ? req.query.before.trim()
            : undefined;
        const hasType = parseHasType(req.query.hasType);
        const hasAttachment = parseHasAttachment(req.query.hasAttachment);

        const t0 = process.hrtime.bigint();
        try {
          const rows = await searchEchoMessagesInChannels(pool, {
            channelIds: [channelId],
            ...(q.length >= 1 ? { q } : {}),
            ...(authorId ? { authorId } : {}),
            ...(mentions ? { mentionSubstr: mentions } : {}),
            ...(before ? { before } : {}),
            limit,
            ...(hasType ? { hasType } : {}),
            ...(hasAttachment ? { hasAttachment: true } : {}),
          });
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          echoMessageSearchDurationSeconds.labels('channel').observe(ms / 1000);
          echoMessageSearchResultCount.labels('channel').observe(rows.length);
          req.log.info({
            msg: 'echo.rest.messages_search',
            scope: 'channel',
            channelId,
            userId,
            durationMs: Math.round(ms),
            resultCount: rows.length,
          });
          return reply.code(200).send({
            messages: redactAnonymousPollsInEchoMessageRows(rows, userId),
          });
        } catch (err) {
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          echoMessageSearchDurationSeconds.labels('channel').observe(ms / 1000);
          req.log.error({ err, channelId }, 'echo.rest.messages_search_failed');
          return sendError(reply, 500, 'INTERNAL_ERROR', 'Search failed');
        }
      },
    );
  });
}
