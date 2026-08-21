import type { FastifyInstance } from 'fastify';
import { ECHO_MEDIA_CDN_TOKEN_QUERY_PARAM } from '../../../../contracts/mediaCdn';
import { normalizeEchoUploadStorageKeyPath } from '../../../../contracts/echoUploadStorageKey';
import {
  hasMediaCdnVariantQuery,
  isRasterImageStorageKey,
  parseMediaCdnVariantQuery,
} from '../../../../contracts/mediaCdnVariants';
import { echoUploadPrefersS3ObjectStore } from '../uploadBackend';
import {
  cacheControlForStorageKey,
  cacheControlForVariant,
} from '../cachePolicy';
import { mediaCdnObjectServeTotal } from '../metrics';
import { sendLocalObject } from '../localOrigin';
import { sendS3Object } from '../s3Origin';
import { verifyObjectReadToken } from '../tokenGate';
import { fetchObjectBuffer } from '../objectBuffer';
import { transformRasterVariant } from '../rasterImageTransform';

function decodeObjectRouteStorageKey(star: string): string | null {
  if (!star) return null;
  try {
    const decoded = decodeURIComponent(star.replace(/\+/g, ' '));
    return normalizeEchoUploadStorageKeyPath(decoded);
  } catch {
    return null;
  }
}

export async function registerObjectGetRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get<{ Params: { '*': string } }>(
    '/v1/o/*',
    {
      config: {
        rateLimit: {
          max: 600,
          timeWindow: '1 minute',
          keyGenerator: (req) => `media_cdn_get_ip:${req.ip}`,
        },
      },
    },
    async (req, reply) => {
      const storageKey = decodeObjectRouteStorageKey(
        (req.params as { '*': string })['*'] ?? '',
      );
      if (!storageKey) {
        mediaCdnObjectServeTotal.inc({
          outcome: 'invalid_key',
          origin: 'none',
        });
        return reply.code(400).send({ error: 'invalid_storage_key' });
      }

      const tokenRaw = (req.query as Record<string, unknown>)[
        ECHO_MEDIA_CDN_TOKEN_QUERY_PARAM
      ];
      const token = typeof tokenRaw === 'string' ? tokenRaw : undefined;
      if (!verifyObjectReadToken(token, storageKey)) {
        mediaCdnObjectServeTotal.inc({ outcome: 'forbidden', origin: 'none' });
        return reply.code(403).send({ error: 'invalid_or_missing_token' });
      }

      reply.header('X-Content-Type-Options', 'nosniff');

      const query = req.query as Record<string, unknown>;
      if (hasMediaCdnVariantQuery(query)) {
        if (typeof req.headers.range === 'string') {
          mediaCdnObjectServeTotal.inc({
            outcome: 'invalid_variant',
            origin: 'none',
          });
          return reply
            .code(400)
            .send({ error: 'range_not_supported_with_variants' });
        }
        if (!isRasterImageStorageKey(storageKey)) {
          mediaCdnObjectServeTotal.inc({
            outcome: 'invalid_variant',
            origin: 'none',
          });
          return reply.code(400).send({ error: 'variants_not_supported' });
        }
        const variant = parseMediaCdnVariantQuery(query);
        if (!variant) {
          mediaCdnObjectServeTotal.inc({
            outcome: 'invalid_variant',
            origin: 'none',
          });
          return reply.code(400).send({ error: 'invalid_variant_params' });
        }
        try {
          const source = await fetchObjectBuffer(storageKey);
          if (!source?.length) {
            mediaCdnObjectServeTotal.inc({
              outcome: 'not_found',
              origin: echoUploadPrefersS3ObjectStore(storageKey)
                ? 's3'
                : 'local',
            });
            return reply.code(404).send();
          }
          const body = await transformRasterVariant(source, variant);
          reply.header('Cache-Control', cacheControlForVariant(storageKey));
          mediaCdnObjectServeTotal.inc({
            outcome: 'ok',
            origin: 'variant',
          });
          return reply.type('image/webp').send(body);
        } catch (err) {
          req.log.error(
            { err, storageKeyHead: storageKey.slice(0, 28) },
            'media_cdn_variant_failed',
          );
          mediaCdnObjectServeTotal.inc({ outcome: 'error', origin: 'variant' });
          return reply.code(500).send({ error: 'variant_failed' });
        }
      }

      reply.header('Cache-Control', cacheControlForStorageKey(storageKey));

      const useS3 = echoUploadPrefersS3ObjectStore(storageKey);
      try {
        if (useS3) {
          await sendS3Object(reply, req, storageKey);
          mediaCdnObjectServeTotal.inc({ outcome: 'ok', origin: 's3' });
          return;
        }
        await sendLocalObject(reply, req, storageKey);
        mediaCdnObjectServeTotal.inc({ outcome: 'ok', origin: 'local' });
      } catch (err) {
        req.log.error(
          { err, storageKeyHead: storageKey.slice(0, 28) },
          'media_cdn_serve_failed',
        );
        mediaCdnObjectServeTotal.inc({
          outcome: 'error',
          origin: useS3 ? 's3' : 'local',
        });
        if (!reply.sent) {
          return reply.code(500).send({ error: 'serve_failed' });
        }
      }
    },
  );
}
