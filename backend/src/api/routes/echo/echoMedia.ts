import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import { sendError } from '../../errors';
import { authUserOrIpRateLimitKey } from '../../rateLimitKeys';
import { requireEchoStore } from './echoRouteUtils';
import {
  isEchoPublicMediaCdnStorageKey,
  type MediaCdnReadScope,
} from '../../../../../shared/mediaCdn';
import {
  signMediaCdnUrlsForRequest,
  type MediaCdnSignItem,
} from '../../../services/mediaCdnSign';
import { extractStorageKeyFromEchoMediaUrl } from '../../../services/echoEmojiAsset';

type MediaSignBody = {
  items?: MediaCdnSignItem[];
  storageKey?: string;
  publicUrl?: string;
  scope?: MediaCdnReadScope;
};

function normalizeMediaSignBody(
  body: MediaSignBody | undefined,
): MediaCdnSignItem[] {
  if (Array.isArray(body?.items) && body.items.length > 0) {
    return body.items;
  }
  const storageKey =
    typeof body?.storageKey === 'string' ? body.storageKey.trim() : '';
  const publicUrl =
    typeof body?.publicUrl === 'string' ? body.publicUrl.trim() : '';
  if (storageKey || publicUrl) {
    return [
      {
        ...(storageKey ? { storageKey } : {}),
        ...(publicUrl ? { publicUrl } : {}),
        ...(body?.scope ? { scope: body.scope } : {}),
      },
    ];
  }
  return [];
}

async function requireAuthUnlessPublicMediaSign(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = (req.body ?? {}) as MediaSignBody;
  const items = normalizeMediaSignBody(body);
  if (!items.length) {
    await requireAuth(req, reply);
    return;
  }
  const allPublic = items.every((item) => {
    const key =
      (typeof item.storageKey === 'string' ? item.storageKey.trim() : '') ||
      (typeof item.publicUrl === 'string'
        ? extractStorageKeyFromEchoMediaUrl(item.publicUrl.trim())
        : null);
    return key ? isEchoPublicMediaCdnStorageKey(key) : false;
  });
  if (allPublic) return;
  await requireAuth(req, reply);
}

export default async function echoMediaRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.post<{ Body: MediaSignBody }>(
    '/media/sign',
    {
      preHandler: [requireAuthUnlessPublicMediaSign, requireEchoStore],
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const items = normalizeMediaSignBody(req.body);
      const result = await signMediaCdnUrlsForRequest(req, items);
      if (!result.ok) {
        return sendError(reply, result.status, result.code, result.message);
      }
      if (result.urls.length === 1) {
        const one = result.urls[0]!;
        return reply.code(200).send({
          storageKey: one.storageKey,
          url: one.url,
          expiresAt: one.expiresAt,
          scope: one.scope,
          expiresInSeconds: Math.max(
            1,
            Math.floor((one.expiresAt - Date.now()) / 1000),
          ),
          urls: result.urls,
        });
      }
      return reply.code(200).send({ urls: result.urls });
    },
  );
}
