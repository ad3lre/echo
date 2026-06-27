import type { FastifyInstance } from 'fastify';
import { ECHO_MEDIA_CDN_TOKEN_QUERY_PARAM } from '../../../shared/mediaCdn';
import { normalizeEchoUploadStorageKeyPath } from '../../../shared/echoUploadStorageKey';
import { echoUploadPrefersS3ObjectStore } from '../uploadBackend';
import { cacheControlForStorageKey } from '../cachePolicy';
import { mediaCdnObjectServeTotal } from '../metrics';
import { sendLocalObject } from '../localOrigin';
import { sendS3Object } from '../s3Origin';
import { verifyObjectReadToken } from '../tokenGate';

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
