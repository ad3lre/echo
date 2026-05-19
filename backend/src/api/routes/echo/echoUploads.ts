import path from 'path';
import type { Readable } from 'stream';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import { config } from '../../../config';
import {
  canUserAccessChannel,
  isMemberOfServer,
} from '../../../domain/echoPermissions';
import { echoUsersShareAnyServer } from '../../../domain/echoStore/social';
import { getEchoEntitlements } from '../../../domain/echoPlanEntitlements';
import { sendError } from '../../errors';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import {
  findEchoUploadDedupeMatch,
  registerEchoUploadDedupe,
} from '../../../services/echoUploadDedupe';
import { sanitizeEchoUploadObjectKeyFragment } from '../../../services/echoUploadKeyUtils';
import {
  buildEchoUploadPublicUrlForStorageKey,
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
  getEchoUploadPublicUrlPrefixes,
  presignEchoUpload,
  isEchoS3UploadConfigured,
} from '../../../services/s3UploadPresign';
import { resolveEchoUploadStorageKey } from '../../../services/echoUploadResolveDest';
import {
  getLocalUploadPublicPathPrefix,
  resolveLocalUploadFilePath,
  writeLocalEchoUploadFileStream,
} from '../../../services/localUploadDisk';
import {
  signLocalUploadToken,
  verifyLocalUploadToken,
} from '../../../services/localUploadToken';
import { consumeLocalUploadTokenOnce } from '../../../services/localUploadTokenReplay';
import { getPgPool } from '../../../db/pg';
import { enqueueEchoChatVideoOptimize } from '../../../services/echoVideoOptimizeQueue';
import {
  purgeEchoUploadObject,
  runEchoImageUploadSafetyRegisterStep,
} from '../../../services/csamScan';
import { authUserOrIpRateLimitKey } from '../../rateLimitKeys';
import { echoPool, requireEchoStore } from './echoRouteUtils';

export type EchoPresignBody = {
  /** Preferred: authorize with canUserPostMessage (guild + DM channels). */
  channelId?: string;
  /** Legacy guild chat, server emoji, server branding, or required with some `purpose` values. */
  serverId?: string;
  /**
   * - Chat: omit with `channelId`, or `legacy_server` with `serverId`.
   * - `server_emoji`: custom emoji image; needs `serverId`.
   * - `user_avatar` / `user_banner`: profile images; do not send `channelId` or `serverId`.
   * - `server_icon` / `server_banner`: needs `serverId` + `MANAGE_GUILD`.
   * - `server_event_cover`: guild scheduled event hero image; needs `serverId` + `MANAGE_GUILD` (or owner).
   * - `server_application_attachment`: join-application file; needs `serverId`; authenticated non-member while applications are enabled.
   * - `bug_report`: screenshots for in-app bug reports; no `channelId` or `serverId`.
   */
  purpose?:
    | 'channel_media'
    | 'legacy_server'
    | 'server_emoji'
    | 'user_avatar'
    | 'user_banner'
    | 'server_icon'
    | 'server_banner'
    | 'server_event_cover'
    | 'server_application_attachment'
    | 'bug_report';
  key?: string;
  contentType?: string;
  contentLength?: number;
};

function readUploadTokenFromAuthorizationHeader(
  req: FastifyRequest,
): string | null {
  const raw = req.headers.authorization;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const prefix = 'bearer ';
  if (!trimmed.toLowerCase().startsWith(prefix)) return null;
  const token = trimmed.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

function localPublicUrlForStorageKey(storageKey: string): string {
  return (
    getLocalUploadPublicPathPrefix() +
    storageKey.split('/').map(encodeURIComponent).join('/')
  );
}

function guessContentTypeFromPath(absPath: string): string {
  const ext = path.extname(absPath).toLowerCase();
  const m: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return m[ext] ?? 'application/octet-stream';
}

function dedupeScopePrefixFromStorageKey(storageKey: string): string {
  const trimmed = storageKey.trim();
  const slash = trimmed.lastIndexOf('/');
  if (slash <= 0) return trimmed;
  return trimmed.slice(0, slash + 1);
}

async function canUserReadLocalUploadStorageKey(
  req: FastifyRequest,
  storageKey: string,
): Promise<boolean> {
  const userId = req.authUser?.id?.trim();
  if (!userId) return false;
  const key = storageKey.trim();
  if (!key) return false;
  const pool = getPgPool();
  if (!pool) return false;
  if (key.startsWith('echo/channels/')) {
    const parts = key.split('/');
    const channelId = parts[2]?.trim();
    if (!channelId) return false;
    return canUserAccessChannel(pool, userId, channelId);
  }
  if (key.startsWith('echo/bug-reports/')) {
    const parts = key.split('/');
    const ownerId = parts[2]?.trim();
    return ownerId === userId;
  }
  if (key.startsWith('echo/avatars/') || key.startsWith('echo/banners/')) {
    const parts = key.split('/');
    const ownerId = parts[2]?.trim();
    if (!ownerId) return false;
    if (ownerId === userId) return true;
    return echoUsersShareAnyServer(pool, userId, ownerId);
  }
  if (
    key.startsWith('echo/server-icons/') ||
    key.startsWith('echo/server-banners/')
  ) {
    const parts = key.split('/');
    const serverId = parts[2]?.trim();
    if (!serverId) return false;
    return isMemberOfServer(pool, serverId, userId);
  }
  if (key.startsWith('echo/emoji/')) {
    const parts = key.split('/');
    const serverId = parts[2]?.trim();
    if (!serverId) return false;
    return isMemberOfServer(pool, serverId, userId);
  }
  if (key.startsWith('echo/')) {
    const parts = key.split('/');
    const serverId = parts[1]?.trim();
    if (!serverId) return false;
    return isMemberOfServer(pool, serverId, userId);
  }
  return false;
}

export default async function echoUploadsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get(
    '/uploads/files/*',
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      if (!config.echoLocalUploadDir) {
        return sendError(reply, 404, 'NOT_FOUND', 'Not found');
      }
      const star = (req.params as { '*': string })['*'];
      if (typeof star !== 'string' || !star) {
        return sendError(reply, 404, 'NOT_FOUND', 'Not found');
      }
      const key = decodeURIComponent(star.replace(/\+/g, ' '));
      const canRead = await canUserReadLocalUploadStorageKey(req, key);
      if (!canRead) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to read this upload',
        );
      }
      const abs = resolveLocalUploadFilePath(key);
      if (!abs) {
        return sendError(reply, 404, 'NOT_FOUND', 'Not found');
      }
      try {
        await stat(abs);
      } catch {
        return sendError(reply, 404, 'NOT_FOUND', 'Not found');
      }
      const stream = createReadStream(abs);
      let ct = guessContentTypeFromPath(abs);
      const pgPool = getPgPool();
      if (pgPool) {
        try {
          const r = await pgPool.query<{ content_type: string }>(
            `SELECT content_type FROM echo_upload_served_content_type WHERE storage_key = $1 LIMIT 1`,
            [key],
          );
          const rowCt = r.rows[0]?.content_type;
          if (typeof rowCt === 'string' && rowCt.trim()) {
            ct = rowCt.trim();
          }
        } catch {
          /* use extension-based guess */
        }
      }
      return reply
        .header('Cache-Control', 'private, no-store')
        .header('Vary', 'X-Forwarded-Proto, X-Forwarded-Host')
        .type(ct)
        .send(stream);
    },
  );

  await fastify.register(
    async function localUploadPutScope(f) {
      f.addContentTypeParser('*', (_request, payload, done) => {
        done(null, payload);
      });

      f.put(
        '/uploads/local/put',
        {
          preHandler: [requireAuth, requireEchoStore],
          bodyLimit: config.echoLocalUploadBodyMaxBytes,
          config: {
            rateLimit: {
              max: 20,
              timeWindow: '1 minute',
              keyGenerator: authUserOrIpRateLimitKey,
            },
          },
        },
        async (req, reply) => {
          const localRoot = config.echoLocalUploadDir;
          if (!localRoot) {
            return sendError(
              reply,
              503,
              'UPLOADS_NOT_CONFIGURED',
              'Local uploads are disabled',
            );
          }
          const tokenRaw = readUploadTokenFromAuthorizationHeader(req) ?? '';
          if (!tokenRaw) {
            return sendError(
              reply,
              400,
              'INVALID_BODY',
              'Authorization Bearer upload token required',
            );
          }
          const payload = verifyLocalUploadToken(tokenRaw);
          if (!payload) {
            return sendError(reply, 403, 'FORBIDDEN', 'Invalid upload token');
          }
          const userId = req.authUser!.id;
          if (payload.userId !== userId) {
            return sendError(reply, 403, 'FORBIDDEN', 'Upload token mismatch');
          }
          const consumed = await consumeLocalUploadTokenOnce(
            tokenRaw,
            payload.exp,
          );
          if (!consumed) {
            return sendError(
              reply,
              409,
              'UPLOAD_TOKEN_REPLAYED',
              'Upload token already used or expired',
            );
          }
          const stream = req.body as Readable | undefined;
          if (!stream || typeof stream.pipe !== 'function') {
            return sendError(reply, 400, 'INVALID_BODY', 'Expected raw body');
          }
          const ct = (
            req.headers['content-type'] as string | undefined
          )?.trim();
          const expectedCt = payload.contentType.trim().toLowerCase();
          if (ct && ct.toLowerCase() !== expectedCt) {
            stream.destroy();
            return sendError(
              reply,
              400,
              'INVALID_BODY',
              'Content-Type does not match presign',
            );
          }
          try {
            await writeLocalEchoUploadFileStream(
              payload.storageKey,
              stream,
              payload.contentLength,
              config.echoLocalUploadBodyMaxBytes,
            );
          } catch (e) {
            req.log.warn({ err: e }, 'local upload write failed');
            const msg = e instanceof Error ? e.message : '';
            if (
              msg.includes('declared content length') ||
              msg.includes('content length') ||
              msg.includes('exceeds') ||
              msg.includes('Invalid content length')
            ) {
              return sendError(
                reply,
                400,
                'INVALID_BODY',
                'Body size does not match declared content length',
              );
            }
            if (msg.includes('already exists')) {
              return sendError(
                reply,
                409,
                'UPLOAD_TOKEN_REPLAYED',
                'Upload token already used for this destination',
              );
            }
            return sendError(reply, 500, 'INTERNAL', 'Upload failed');
          }
          return reply.code(204).send();
        },
      );
    },
    { bodyLimit: config.echoLocalUploadBodyMaxBytes },
  );

  fastify.post<{ Body: EchoPresignBody }>(
    '/uploads/presign',
    {
      preHandler: [requireAuth, requireEchoStore],
      bodyLimit: 32 * 1024,
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const userId = req.authUser!.id;

      const objectKeyRaw =
        typeof req.body?.key === 'string' ? req.body.key : '';
      const objectKey = sanitizeEchoUploadObjectKeyFragment(objectKeyRaw);
      const contentType =
        typeof req.body?.contentType === 'string' && req.body.contentType.trim()
          ? req.body.contentType.trim()
          : 'application/octet-stream';
      const contentLength =
        typeof req.body?.contentLength === 'number' &&
        Number.isFinite(req.body.contentLength)
          ? req.body.contentLength
          : 0;

      if (!objectKey) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'key required (safe filename or path fragment)',
        );
      }

      const ent = await getEchoEntitlements(pool, userId);
      const useLocalDisk =
        !isEchoS3UploadConfigured() && Boolean(config.echoLocalUploadDir);
      const effectiveCap = useLocalDisk
        ? Math.min(ent.uploadMaxBytes, config.echoLocalUploadBodyMaxBytes)
        : ent.uploadMaxBytes;

      if (
        !Number.isFinite(contentLength) ||
        contentLength < 1 ||
        contentLength > effectiveCap
      ) {
        const localOnlyBlock =
          useLocalDisk &&
          Number.isFinite(contentLength) &&
          contentLength > config.echoLocalUploadBodyMaxBytes &&
          contentLength <= ent.uploadMaxBytes;
        console.warn(
          localOnlyBlock
            ? `Upload too large: local server limit=${config.echoLocalUploadBodyMaxBytes}, effectiveCap=${effectiveCap}, contentLength=${contentLength}`
            : `Upload too large: effectiveCap=${effectiveCap}, contentLength=${contentLength}`,
        );
        return sendError(reply, 400, 'UPLOAD_TOO_LARGE', 'File too large');
      }

      const channelId =
        typeof req.body?.channelId === 'string'
          ? req.body.channelId.trim()
          : '';
      const serverId =
        typeof req.body?.serverId === 'string' ? req.body.serverId.trim() : '';
      const purpose = req.body?.purpose;

      const dest = await resolveEchoUploadStorageKey(pool, userId, {
        channelId,
        serverId,
        purpose,
        contentType,
        objectKey,
      });
      if (!dest.ok) {
        return sendError(
          reply,
          dest.error.status,
          dest.error.code,
          dest.error.message,
          dest.error.detail,
        );
      }
      const storageKey = dest.storageKey;

      const signed = await presignEchoUpload({
        key: storageKey,
        contentType,
        contentLength,
        maxBytes: ent.uploadMaxBytes,
      });
      if (!signed.ok) {
        if (signed.reason === 'NOT_CONFIGURED' && config.echoLocalUploadDir) {
          const token = signLocalUploadToken({
            storageKey,
            userId,
            contentType,
            contentLength,
          });
          const uploadUrl = '/api/v1/echo/uploads/local/put';
          const publicUrl = localPublicUrlForStorageKey(storageKey);
          return reply
            .code(200)
            .header('Cache-Control', 'private, no-store')
            .send({
              uploadMode: 'local' as const,
              uploadUrl,
              publicUrl,
              key: storageKey,
              headers: {
                'Content-Type': contentType,
                Authorization: `Bearer ${token}`,
              },
              publicUrlPrefixes: getEchoUploadPublicUrlPrefixes(),
            });
        }
        if (signed.reason === 'NOT_CONFIGURED') {
          return sendError(
            reply,
            503,
            'UPLOADS_NOT_CONFIGURED',
            'Set ECHO_S3_BUCKET, ECHO_S3_REGION, ECHO_S3_ACCESS_KEY, ECHO_S3_SECRET_KEY (optional ECHO_S3_ENDPOINT for R2), or enable disk fallback (unset S3 env and keep ECHO_LOCAL_UPLOADS default)',
          );
        }
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Invalid upload parameters',
        );
      }
      return reply
        .code(200)
        .header('Cache-Control', 'private, no-store')
        .send({
          uploadMode: 's3' as const,
          uploadUrl: signed.uploadUrl,
          publicUrl: signed.publicUrl,
          key: signed.key,
          headers: signed.headers,
          publicUrlPrefixes: getEchoUploadPublicUrlPrefixes(),
        });
    },
  );

  type EchoDedupeMatchBody = {
    channelId?: string;
    serverId?: string;
    purpose?: EchoPresignBody['purpose'];
    contentType?: string;
    sha256Hex?: string;
    phashHex?: string;
    kind?: 'image' | 'video';
  };

  fastify.post<{ Body: EchoDedupeMatchBody }>(
    '/uploads/dedupe/match',
    {
      preHandler: [requireAuth, requireEchoStore],
      bodyLimit: 4096,
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const userId = req.authUser!.id;
      const body = req.body;

      const sha256Hex =
        typeof body?.sha256Hex === 'string' ? body.sha256Hex.trim() : '';
      const phashHex =
        typeof body?.phashHex === 'string' ? body.phashHex.trim() : '';
      const kind = body?.kind;
      const contentType =
        typeof body?.contentType === 'string' && body.contentType.trim()
          ? body.contentType.trim()
          : '';

      if (
        !sha256Hex ||
        !phashHex ||
        (kind !== 'image' && kind !== 'video') ||
        !contentType
      ) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'sha256Hex, phashHex, kind, and contentType are required',
        );
      }

      const ct = contentType.toLowerCase();
      if (kind === 'image' && !ct.startsWith('image/')) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'kind image requires an image/* content type',
        );
      }
      if (kind === 'video' && !ct.startsWith('video/')) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'kind video requires a video/* content type',
        );
      }

      const destProbe = await resolveEchoUploadStorageKey(pool, userId, {
        channelId:
          typeof body.channelId === 'string' ? body.channelId.trim() : '',
        serverId: typeof body.serverId === 'string' ? body.serverId.trim() : '',
        purpose: body.purpose,
        contentType,
        objectKey: 'dedupe-probe',
      });
      if (!destProbe.ok) {
        return sendError(
          reply,
          destProbe.error.status,
          destProbe.error.code,
          destProbe.error.message,
          destProbe.error.detail,
        );
      }

      const reusePublicUrl = await findEchoUploadDedupeMatch(pool, {
        kind,
        sha256Hex,
        phashHex,
        uploaderId: userId,
        storageKeyPrefix: dedupeScopePrefixFromStorageKey(destProbe.storageKey),
      });

      return reply
        .code(200)
        .header('Cache-Control', 'private, no-store')
        .send({ reusePublicUrl });
    },
  );

  type EchoDedupeRegisterBody = {
    channelId?: string;
    serverId?: string;
    purpose?: EchoPresignBody['purpose'];
    contentType?: string;
    objectKey?: string;
    storageKey?: string;
    publicUrl?: string;
    sha256Hex?: string;
    phashHex?: string;
    kind?: 'image' | 'video';
    byteLength?: number;
  };

  fastify.post<{ Body: EchoDedupeRegisterBody }>(
    '/uploads/dedupe/register',
    {
      preHandler: [requireAuth, requireEchoStore],
      bodyLimit: 8192,
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const userId = req.authUser!.id;
      const body = req.body;

      const objectKeyRaw =
        typeof body?.objectKey === 'string' ? body.objectKey : '';
      const objectKey = sanitizeEchoUploadObjectKeyFragment(objectKeyRaw);
      const storageKeyClient =
        typeof body?.storageKey === 'string' ? body.storageKey.trim() : '';
      const sha256Hex =
        typeof body?.sha256Hex === 'string' ? body.sha256Hex.trim() : '';
      const phashHex =
        typeof body?.phashHex === 'string' ? body.phashHex.trim() : '';
      const kind = body?.kind;
      const contentType =
        typeof body?.contentType === 'string' && body.contentType.trim()
          ? body.contentType.trim()
          : '';
      const byteLength =
        typeof body?.byteLength === 'number' && Number.isFinite(body.byteLength)
          ? body.byteLength
          : 0;
      const channelIdReg =
        typeof body.channelId === 'string' ? body.channelId.trim() : '';

      if (
        !objectKey ||
        !storageKeyClient ||
        !sha256Hex ||
        !phashHex ||
        (kind !== 'image' && kind !== 'video') ||
        !contentType ||
        byteLength < 1
      ) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'objectKey, storageKey, sha256Hex, phashHex, kind, contentType, and byteLength are required',
        );
      }

      const ct = contentType.toLowerCase();
      if (kind === 'image' && !ct.startsWith('image/')) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'kind image requires an image/* content type',
        );
      }
      if (kind === 'video' && !ct.startsWith('video/')) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'kind video requires a video/* content type',
        );
      }

      const dest = await resolveEchoUploadStorageKey(pool, userId, {
        channelId:
          typeof body.channelId === 'string' ? body.channelId.trim() : '',
        serverId: typeof body.serverId === 'string' ? body.serverId.trim() : '',
        purpose: body.purpose,
        contentType,
        objectKey,
      });
      if (!dest.ok) {
        return sendError(
          reply,
          dest.error.status,
          dest.error.code,
          dest.error.message,
          dest.error.detail,
        );
      }

      if (dest.storageKey !== storageKeyClient) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'storageKey does not match upload destination',
        );
      }

      const publicUrl = buildEchoUploadPublicUrlForStorageKey(storageKeyClient);
      if (!publicUrl) {
        return sendError(
          reply,
          503,
          'UPLOADS_NOT_CONFIGURED',
          'Upload public URL is not configured for this storage destination',
        );
      }
      if (config.echoLocalUploadDir) {
        const abs = resolveLocalUploadFilePath(storageKeyClient);
        if (!abs) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'storageKey resolves outside local upload root',
          );
        }
        const info = await stat(abs).catch(() => null);
        if (!info || !info.isFile()) {
          return sendError(
            reply,
            404,
            'NOT_FOUND',
            'Uploaded object not found',
          );
        }
        if (info.size !== byteLength) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Uploaded object size does not match declared byteLength',
          );
        }
      } else {
        const bucket = getEchoS3UploadBucket();
        const s3 = createEchoS3UploadClient();
        if (!bucket || !s3) {
          return sendError(
            reply,
            503,
            'UPLOADS_NOT_CONFIGURED',
            'Upload object verification unavailable',
          );
        }
        let head;
        try {
          head = await s3.send(
            new HeadObjectCommand({ Bucket: bucket, Key: storageKeyClient }),
          );
        } catch {
          return sendError(
            reply,
            404,
            'NOT_FOUND',
            'Uploaded object not found',
          );
        }
        if (Number(head.ContentLength ?? -1) !== byteLength) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Uploaded object size does not match declared byteLength',
          );
        }
        const headType = String(head.ContentType ?? '')
          .trim()
          .toLowerCase();
        if (!headType || headType !== ct) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Uploaded object content type mismatch',
          );
        }
      }

      const safetyLog = {
        warn: (o: unknown, m?: string) => req.log.warn(o, m),
        info: (o: unknown, m?: string) => req.log.info(o, m),
      };
      const safety = await runEchoImageUploadSafetyRegisterStep({
        kind,
        storageKey: storageKeyClient,
        byteLength,
        sha256HexClient: sha256Hex,
        log: safetyLog,
      });
      if (!safety.ok) {
        if (safety.reason === 'integrity_sha256_mismatch') {
          await purgeEchoUploadObject(storageKeyClient).catch(() => {});
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Uploaded object does not match declared fingerprint',
          );
        }
        if (safety.reason === 'policy_block') {
          await purgeEchoUploadObject(storageKeyClient).catch(() => {});
          req.log.warn(
            {
              echo_csam: 'upload_blocked',
              storage_key_head: storageKeyClient.slice(0, 28),
            },
            'echo.csam.upload_blocked',
          );
          return sendError(reply, 403, 'FORBIDDEN', 'Upload not allowed');
        }
        await purgeEchoUploadObject(storageKeyClient).catch(() => {});
        return sendError(reply, 503, 'INTERNAL', 'Upload processing failed');
      }

      await registerEchoUploadDedupe(pool, {
        kind,
        sha256Hex,
        phashHex,
        byteLength,
        publicUrl,
        storageKey: storageKeyClient,
        uploaderId: userId,
      });

      if (kind === 'video' && channelIdReg) {
        await enqueueEchoChatVideoOptimize(pool, {
          storageKey: storageKeyClient,
          publicUrl,
          sourceContentType: contentType,
        });
      }

      return reply.code(204).send();
    },
  );
}
