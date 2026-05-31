import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getAuthUser, requireAuth } from '../../../auth/middleware';
import { sendEchoCustomEmojiAsset } from '../../../services/echoEmojiAsset';
import { ECHO_MSG_NOT_SERVER_MEMBER, sendError } from '../../errors';
import { authUserOrIpRateLimitKey } from '../../rateLimitKeys';
import { ECHO_EMOJI_USAGE_RATE } from '../../sharedMutationRateLimits';
import {
  addEchoServerCustomEmoji,
  createEchoCustomEmojiPack,
  importEchoMarketEmojiPack,
  incrementEchoEmojiUsage,
  listEchoServerEmojiLibrary,
  listEchoUserEmojiLibrary,
  listEchoServerStickerLibrary,
  removeEchoServerCustomEmoji,
  renameEchoServerCustomEmoji,
  resolveEchoEmojiTokens,
  updateEchoCustomEmojiPackMeta,
} from '../../../domain/echoStore';
import { isMemberOfServer } from '../../../domain/echoPermissions';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

export default async function echoEmojiLibraryRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/sticker-library',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const ok = await isMemberOfServer(pool, serverId, getAuthUser(req).id);
      if (!ok)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const lib = await listEchoServerStickerLibrary(pool, serverId);
      return reply.code(200).send(lib);
    },
  );

  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/emoji-library',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const ok = await isMemberOfServer(pool, serverId, getAuthUser(req).id);
      if (!ok)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const lib = await listEchoServerEmojiLibrary(pool, serverId);
      return reply.code(200).send(lib);
    },
  );

  fastify.get(
    '/users/me/emoji-library',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const lib = await listEchoUserEmojiLibrary(pool);
      return reply.code(200).send(lib);
    },
  );

  fastify.get<{ Params: { emojiId: string } }>(
    '/emoji/:emojiId/asset',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const emojiId = trimEchoPathParam(req.params.emojiId);
      if (!emojiId || !/^\d+$/.test(emojiId))
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid emoji id');
      const pool = echoPool(req);
      await sendEchoCustomEmojiAsset(pool, reply, emojiId);
    },
  );

  fastify.post<{
    Body: { ids?: unknown };
  }>(
    '/emoji/resolve',
    {
      preHandler: [requireAuth, requireEchoStore],
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['ids'],
          properties: {
            ids: {
              type: 'array',
              maxItems: 200,
              items: { type: 'string', maxLength: 64 },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const idsRaw = req.body?.ids;
      if (!Array.isArray(idsRaw))
        return sendError(reply, 400, 'INVALID_BODY', 'ids required');
      if (idsRaw.length > 200)
        return sendError(reply, 400, 'INVALID_BODY', 'Too many ids');
      const ids = idsRaw.filter((v) => typeof v === 'string') as string[];
      const pool = echoPool(req);
      const emojis = await resolveEchoEmojiTokens(
        pool,
        getAuthUser(req).id,
        ids,
      );
      return reply.code(200).send({ emojis });
    },
  );

  fastify.post<{
    Params: { serverId: string };
    Body: { marketPackId?: string };
  }>(
    '/servers/:serverId/emoji-packs/import-market',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const ok = await isMemberOfServer(pool, serverId, getAuthUser(req).id);
      if (!ok)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const marketPackId =
        typeof req.body?.marketPackId === 'string'
          ? req.body.marketPackId.trim()
          : '';
      if (!marketPackId)
        return sendError(reply, 400, 'INVALID_BODY', 'marketPackId required');
      const r = await importEchoMarketEmojiPack(
        pool,
        serverId,
        getAuthUser(req).id,
        marketPackId,
      );
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Cannot manage server emojis',
        );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Unknown market pack');
      if (r === 'limit')
        return sendError(reply, 400, 'LIMIT', 'Maximum emoji packs reached');
      if (r === 'duplicate')
        return sendError(reply, 409, 'DUPLICATE', 'Pack already imported');
      return reply.code(204).send();
    },
  );

  fastify.post<{
    Params: { serverId: string };
    Body: {
      name?: string;
      description?: string;
      marketSettings?: unknown;
      listedInMarket?: boolean;
    };
  }>(
    '/servers/:serverId/emoji-packs/custom',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const ok = await isMemberOfServer(pool, serverId, getAuthUser(req).id);
      if (!ok)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const name = typeof req.body?.name === 'string' ? req.body.name : '';
      const description =
        typeof req.body?.description === 'string' ? req.body.description : '';
      const listedInMarket = req.body?.listedInMarket !== false;
      const r = await createEchoCustomEmojiPack(
        pool,
        serverId,
        getAuthUser(req).id,
        name,
        description,
        req.body?.marketSettings,
        listedInMarket,
      );
      if (!r.ok) {
        if (r.reason === 'forbidden')
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Cannot manage server emojis',
          );
        if (r.reason === 'limit')
          return sendError(reply, 400, 'LIMIT', 'Maximum emoji packs reached');
        if (r.reason === 'bad_description') {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Description is required (min length enforced)',
          );
        }
        if (r.reason === 'bad_settings')
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Invalid marketSettings',
          );
        return sendError(reply, 400, 'INVALID_BODY', 'Could not create pack');
      }
      return reply.code(201).send({ packId: r.packId });
    },
  );

  fastify.patch<{
    Params: { serverId: string; packId: string };
    Body: {
      name?: string;
      description?: string;
      listedInMarket?: boolean;
      marketSettings?: unknown;
    };
  }>(
    '/servers/:serverId/emoji-packs/:packId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const packId = trimEchoPathParam(req.params.packId);
      const ok = await isMemberOfServer(pool, serverId, getAuthUser(req).id);
      if (!ok)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const r = await updateEchoCustomEmojiPackMeta(
        pool,
        serverId,
        getAuthUser(req).id,
        packId,
        {
          ...(typeof req.body?.name === 'string'
            ? { name: req.body.name }
            : {}),
          ...(typeof req.body?.description === 'string'
            ? { description: req.body.description }
            : {}),
          ...(typeof req.body?.listedInMarket === 'boolean'
            ? { listedInMarket: req.body.listedInMarket }
            : {}),
          ...(req.body?.marketSettings !== undefined
            ? { marketSettings: req.body.marketSettings }
            : {}),
        },
      );
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Cannot manage server emojis',
        );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Pack not found');
      if (r === 'not_custom')
        return sendError(reply, 400, 'INVALID_PACK', 'Not a custom pack');
      if (r === 'bad_description') {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Description is required (min length enforced)',
        );
      }
      if (r === 'bad_settings')
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid marketSettings');
      return reply.code(204).send();
    },
  );

  fastify.post<{
    Params: { serverId: string; packId: string };
    Body: {
      name?: string;
      animated?: boolean;
      imageUrl?: string;
      expressionKind?: 'emoji' | 'sticker';
      stickerFormat?: string;
    };
  }>(
    '/servers/:serverId/emoji-packs/:packId/emojis',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const packId = trimEchoPathParam(req.params.packId);
      const ok = await isMemberOfServer(pool, serverId, getAuthUser(req).id);
      if (!ok)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const name = typeof req.body?.name === 'string' ? req.body.name : '';
      const imageUrl =
        typeof req.body?.imageUrl === 'string' ? req.body.imageUrl : '';
      const animated = req.body?.animated === true;
      const expressionKind =
        req.body?.expressionKind === 'sticker' ? 'sticker' : 'emoji';
      const stickerFormat =
        typeof req.body?.stickerFormat === 'string'
          ? req.body.stickerFormat
          : undefined;
      if (!name || !imageUrl)
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'name and imageUrl required',
        );
      if (imageUrl.trim().toLowerCase().startsWith('data:')) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'data URLs are not allowed for custom emoji; upload the image first and pass an HTTP(S) or local upload URL',
        );
      }
      const r = await addEchoServerCustomEmoji(
        pool,
        serverId,
        getAuthUser(req).id,
        packId,
        name,
        animated,
        imageUrl,
        { expressionKind, stickerFormat },
      );
      if (!r.ok) {
        if (r.reason === 'forbidden')
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Cannot manage server emojis',
          );
        if (r.reason === 'not_found')
          return sendError(reply, 404, 'NOT_FOUND', 'Pack not found');
        if (r.reason === 'not_custom_pack')
          return sendError(reply, 400, 'INVALID_PACK', 'Not a custom pack');
        if (r.reason === 'limit')
          return sendError(reply, 400, 'LIMIT', 'Pack is full');
        if (r.reason === 'invalid')
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Invalid name or image URL',
          );
        return sendError(
          reply,
          409,
          'DUPLICATE',
          'Emoji name already used on this server',
        );
      }
      return reply.code(201).send({ id: r.emojiId });
    },
  );

  fastify.delete<{
    Params: { serverId: string; packId: string; emojiId: string };
  }>(
    '/servers/:serverId/emoji-packs/:packId/emojis/:emojiId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const packId = trimEchoPathParam(req.params.packId);
      const emojiId = trimEchoPathParam(req.params.emojiId);
      const ok = await isMemberOfServer(pool, serverId, getAuthUser(req).id);
      if (!ok)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const r = await removeEchoServerCustomEmoji(
        pool,
        serverId,
        getAuthUser(req).id,
        packId,
        emojiId,
      );
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Cannot manage server emojis',
        );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Emoji not found');
      if (r === 'not_custom_pack')
        return sendError(reply, 400, 'INVALID_PACK', 'Not a custom pack');
      return reply.code(204).send();
    },
  );

  fastify.patch<{
    Params: { serverId: string; packId: string; emojiId: string };
    Body: { name?: string };
  }>(
    '/servers/:serverId/emoji-packs/:packId/emojis/:emojiId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const packId = trimEchoPathParam(req.params.packId);
      const emojiId = trimEchoPathParam(req.params.emojiId);
      const ok = await isMemberOfServer(pool, serverId, getAuthUser(req).id);
      if (!ok)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const name = typeof req.body?.name === 'string' ? req.body.name : '';
      if (!name) return sendError(reply, 400, 'INVALID_BODY', 'name required');
      const r = await renameEchoServerCustomEmoji(
        pool,
        serverId,
        getAuthUser(req).id,
        packId,
        emojiId,
        name,
      );
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Cannot manage server emojis',
        );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Emoji not found');
      if (r === 'not_custom_pack')
        return sendError(reply, 400, 'INVALID_PACK', 'Not a custom pack');
      if (r === 'invalid')
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid name');
      if (r === 'duplicate_name')
        return sendError(
          reply,
          409,
          'DUPLICATE',
          'Emoji name already used on this server',
        );
      return reply.code(204).send();
    },
  );

  fastify.post<{ Params: { serverId: string }; Body: { emojiId?: string } }>(
    '/servers/:serverId/emoji-usage',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: ECHO_EMOJI_USAGE_RATE },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const emojiId =
        typeof req.body?.emojiId === 'string' ? req.body.emojiId.trim() : '';
      if (!emojiId)
        return sendError(reply, 400, 'INVALID_BODY', 'emojiId required');
      const ok = await incrementEchoEmojiUsage(
        pool,
        serverId,
        getAuthUser(req).id,
        emojiId,
      );
      if (!ok) return sendError(reply, 403, 'FORBIDDEN', 'Not allowed');
      return reply.code(204).send();
    },
  );
}
