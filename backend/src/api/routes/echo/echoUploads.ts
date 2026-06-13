import type { Readable } from 'stream';
import { stat } from 'fs/promises';
import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import { requireAuth, getAuthUser } from '../../../auth/middleware';
import { config } from '../../../config';
import {
  canUserAccessChannel,
  isMemberOfServer,
} from '../../../domain/echoPermissions';
import { getMergedRolePermissions } from '../../../domain/echoStore/permissions';
import { echoUsersShareAnyServer } from '../../../domain/echoStore/social';
import { getEchoEntitlements } from '../../../domain/echoPlanEntitlements';
import {
  ECHO_RINGTONE_UPLOAD_MAX_BYTES,
  ECHO_WATCH_TOGETHER_MAX_SESSION_BYTES,
  ECHO_WATCH_TOGETHER_MAX_VIDEO_BYTES,
} from '../../../../../shared/echoPlanLimits';
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
  addVcWatchTogetherSessionBytes,
  assertVcWatchTogetherSessionQuota,
  isVcWatchTogetherStorageKey,
  releaseVcWatchTogetherSessionBytes,
} from '../../../services/vcWatchTogetherSessions';
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
import { enqueueEchoChatVideoHls } from '../../../services/echoVideoOptimizeQueue';
import { kickVideoUploadOptimizeJob } from '../../../jobs/videoUploadOptimize';
import { readEchoUploadSourceMetadata } from '../../../services/echoUploadSourceMetadata';
import { extractStorageKeyFromEchoMediaUrl } from '../../../services/echoEmojiAsset';
import {
  getEchoVideoPlaybackBySourceKey,
  type EchoVideoPlaybackRendition,
} from '../../../services/echoVideoPlayback';
import {
  guessEchoUploadContentTypeFromKey,
  sendLocalEchoUploadFile,
  sendS3EchoUploadObject,
} from '../../../services/echoUploadServe';
import {
  sanitizeEchoUploadContentType,
  sanitizeEchoUploadServeContentType,
} from '../../../services/echoUploadContentTypePolicy';
import {
  purgeEchoUploadObject,
  runEchoUploadIntegrityRegisterStep,
} from '../../../services/csamScan';
import {
  signUploadReadToken,
  verifyUploadReadToken,
} from '../../../services/uploadReadToken';
import { authUserOrIpRateLimitKey } from '../../rateLimitKeys';
import { echoPool, requireEchoStore } from './echoRouteUtils';
import { isEchoChatUserMediaStorageKey } from '../../../../../shared/chatMediaRetention';
import {
  isEchoPublicEmojiCdnStorageKey,
  isEchoPublicServerBrandingStorageKey,
  normalizeEchoUploadStorageKeyPath,
} from '../../../../../shared/echoUploadStorageKey';
import {
  getChatUploadRetentionByStorageKey,
  isChatUploadRetentionExpired,
  registerChatUploadRetention,
  touchChatUploadRetention,
} from '../../../services/chatUploadRetention';
import {
  insertEchoUploadIntent,
  markEchoUploadIntentRegistered,
} from '../../../services/echoUploadIntent';
import { verifyEchoUploadReadyToRegister } from '../../../services/echoUploadRegister';
import { importChatRemoteImage } from '../../../services/chatRemoteImageImport';

function sanitizeUploadContentType(
  raw: string,
  fallback = 'application/octet-stream',
): string {
  return sanitizeEchoUploadContentType(raw, fallback).contentType;
}

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
   * - `user_ringtone`: custom call ringtone audio; no `channelId` or `serverId`.
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
    | 'bug_report'
    | 'user_ringtone'
    | 'vc_watch_together';
  /** Required when `purpose` is `vc_watch_together` (20 GB session budget). */
  sessionId?: string;
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
  return guessEchoUploadContentTypeFromKey(absPath);
}

async function assertChatUploadNotRetentionExpired(
  req: FastifyRequest,
  storageKey: string,
): Promise<boolean> {
  if (!isEchoChatUserMediaStorageKey(storageKey)) return true;
  const pool = getPgPool();
  if (!pool) return true;
  const row = await getChatUploadRetentionByStorageKey(pool, storageKey);
  if (!row || !isChatUploadRetentionExpired(row)) return true;
  req.log.info(
    {
      msg: 'chat_upload_retention_expired',
      storage_key_head: storageKey.slice(0, 28),
      expired: true,
    },
    'chat_upload_retention_expired',
  );
  return false;
}

function dedupeScopePrefixFromStorageKey(storageKey: string): string {
  const trimmed = storageKey.trim();
  const slash = trimmed.lastIndexOf('/');
  if (slash <= 0) return trimmed;
  return trimmed.slice(0, slash + 1);
}

function decodeUploadRouteStorageKey(req: FastifyRequest): string | null {
  const star = (req.params as { '*': string })['*'];
  if (typeof star !== 'string' || !star) return null;
  try {
    const decoded = decodeURIComponent(star.replace(/\+/g, ' '));
    return normalizeEchoUploadStorageKeyPath(decoded);
  } catch {
    return null;
  }
}

async function requireAuthUnlessUploadReadGranted(
  req: FastifyRequest,
  reply: FastifyReply,
  storageKey: string | null,
): Promise<void> {
  const key = storageKey?.trim() ?? '';
  if (
    key &&
    (isEchoPublicServerBrandingStorageKey(key) ||
      isEchoPublicEmojiCdnStorageKey(key))
  )
    return;
  const readQuery =
    typeof (req.query as { read?: unknown })?.read === 'string'
      ? (req.query as { read: string }).read.trim()
      : '';
  if (key && readQuery && verifyUploadReadToken(readQuery, key)) return;
  await requireAuth(req, reply);
}

async function requireAuthUnlessPublicServerBrandingUpload(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await requireAuthUnlessUploadReadGranted(
    req,
    reply,
    decodeUploadRouteStorageKey(req),
  );
}

async function requireAuthUnlessPublicServerBrandingS3Upload(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await requireAuthUnlessUploadReadGranted(
    req,
    reply,
    decodeUploadRouteStorageKey(req),
  );
}

async function canAccessUploadStorageKey(
  req: FastifyRequest,
  storageKey: string,
): Promise<boolean> {
  const key = storageKey.trim();
  if (!key) return false;
  if (
    isEchoPublicServerBrandingStorageKey(key) ||
    isEchoPublicEmojiCdnStorageKey(key)
  )
    return true;
  const readQuery =
    typeof (req.query as { read?: unknown })?.read === 'string'
      ? (req.query as { read: string }).read.trim()
      : '';
  if (readQuery && verifyUploadReadToken(readQuery, key)) {
    return true;
  }
  return canUserReadLocalUploadStorageKey(req, key);
}

async function canUserReadLocalUploadStorageKey(
  req: FastifyRequest,
  storageKey: string,
): Promise<boolean> {
  const key = storageKey.trim();
  if (!key) return false;
  const userId = req.authUser?.id?.trim();
  if (!userId) return false;
  const pool = getPgPool();
  if (!pool) return false;
  if (key.startsWith('echo/channels/')) {
    const parts = key.split('/');
    const channelId = parts[2]?.trim();
    if (!channelId) return false;
    return canUserAccessChannel(pool, userId, channelId);
  }
  if (key.startsWith('echo/vc-watch/')) {
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
  if (key.startsWith('echo/ringtones/')) {
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
  if (key.startsWith('echo/emoji/')) {
    const parts = key.split('/');
    const serverId = parts[2]?.trim();
    if (!serverId) return false;
    return isMemberOfServer(pool, serverId, userId);
  }
  if (key.startsWith('echo/server-event-covers/')) {
    const parts = key.split('/');
    const serverId = parts[2]?.trim();
    if (!serverId) return false;
    return isMemberOfServer(pool, serverId, userId);
  }
  if (key.startsWith('echo/server-application-attachments/')) {
    const parts = key.split('/');
    const serverId = parts[2]?.trim();
    const applicantUserId = parts[3]?.trim();
    if (!serverId || !applicantUserId) return false;
    if (userId === applicantUserId) return true;
    if (!(await isMemberOfServer(pool, serverId, userId))) return false;
    const perms = await getMergedRolePermissions(pool, serverId, userId);
    return perms.has('MANAGE_GUILD');
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
  fastify.post<{ Body: { storageKey?: string; publicUrl?: string } }>(
    '/uploads/read-token',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      let storageKey =
        typeof req.body?.storageKey === 'string'
          ? req.body.storageKey.trim()
          : '';
      if (!storageKey) {
        const publicUrl =
          typeof req.body?.publicUrl === 'string'
            ? req.body.publicUrl.trim()
            : '';
        if (publicUrl) {
          storageKey = extractStorageKeyFromEchoMediaUrl(publicUrl) ?? '';
        }
      }
      if (!storageKey) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'storageKey or publicUrl required',
        );
      }
      const canRead = await canUserReadLocalUploadStorageKey(req, storageKey);
      if (!canRead) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to read this upload',
        );
      }
      const readToken = signUploadReadToken(storageKey);
      return reply.code(200).send({
        readToken,
        expiresInSeconds: 3600,
      });
    },
  );

  fastify.get(
    '/uploads/files/*',
    {
      preHandler: [requireAuthUnlessPublicServerBrandingUpload],
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
      const key = decodeUploadRouteStorageKey(req);
      if (!key) {
        return sendError(reply, 404, 'NOT_FOUND', 'Not found');
      }
      const canRead = await canAccessUploadStorageKey(req, key);
      if (!canRead) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to read this upload',
        );
      }
      if (!(await assertChatUploadNotRetentionExpired(req, key))) {
        return sendError(reply, 404, 'NOT_FOUND', 'Not found');
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
      let ct = guessEchoUploadContentTypeFromKey(key);
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
      const serveMeta = sanitizeEchoUploadServeContentType(ct, key);
      const publicRead =
        isEchoPublicServerBrandingStorageKey(key) ||
        isEchoPublicEmojiCdnStorageKey(key);
      reply
        .header(
          'Cache-Control',
          publicRead
            ? 'public, max-age=31536000, immutable'
            : 'private, no-store',
        )
        .header('Vary', 'X-Forwarded-Proto, X-Forwarded-Host');
      return sendLocalEchoUploadFile(
        reply,
        req,
        abs,
        serveMeta.contentType,
        serveMeta,
      );
    },
  );

  fastify.get(
    '/uploads/s3/*',
    {
      preHandler: [requireAuthUnlessPublicServerBrandingS3Upload],
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      if (!config.echoS3PublicReadThroughApi || !isEchoS3UploadConfigured()) {
        return sendError(reply, 404, 'NOT_FOUND', 'Not found');
      }
      const key = decodeUploadRouteStorageKey(req);
      if (!key) {
        return sendError(reply, 404, 'NOT_FOUND', 'Not found');
      }
      const canRead = await canAccessUploadStorageKey(req, key);
      if (!canRead) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to read this upload',
        );
      }
      if (!(await assertChatUploadNotRetentionExpired(req, key))) {
        return sendError(reply, 404, 'NOT_FOUND', 'Not found');
      }
      const client = createEchoS3UploadClient();
      const bucket = getEchoS3UploadBucket();
      if (!client || !bucket) {
        return sendError(
          reply,
          503,
          'UPLOADS_NOT_CONFIGURED',
          'S3 not configured',
        );
      }
      try {
        let servedCt = guessEchoUploadContentTypeFromKey(key);
        const pgPool = getPgPool();
        if (pgPool) {
          try {
            const r = await pgPool.query<{ content_type: string }>(
              `SELECT content_type FROM echo_upload_served_content_type WHERE storage_key = $1 LIMIT 1`,
              [key],
            );
            const rowCt = r.rows[0]?.content_type;
            if (typeof rowCt === 'string' && rowCt.trim()) {
              servedCt = rowCt.trim();
            }
          } catch {
            /* use extension guess */
          }
        }
        const serveMeta = sanitizeEchoUploadServeContentType(servedCt, key);
        let totalSize: number | undefined;
        try {
          const head = await client.send(
            new HeadObjectCommand({ Bucket: bucket, Key: key }),
          );
          if (typeof head.ContentLength === 'number') {
            totalSize = head.ContentLength;
          }
        } catch {
          /* optional for ranged GET */
        }
        const publicRead =
          isEchoPublicServerBrandingStorageKey(key) ||
          isEchoPublicEmojiCdnStorageKey(key);
        reply
          .header(
            'Cache-Control',
            publicRead
              ? 'public, max-age=31536000, immutable'
              : 'private, max-age=300',
          )
          .header(
            'Vary',
            publicRead
              ? 'X-Forwarded-Proto, X-Forwarded-Host'
              : 'Cookie, Authorization',
          );
        return sendS3EchoUploadObject(
          reply,
          req,
          client,
          bucket,
          key,
          serveMeta.contentType,
          totalSize,
          serveMeta,
        );
      } catch (e) {
        const status = (e as { $metadata?: { httpStatusCode?: number } })
          ?.$metadata?.httpStatusCode;
        if (status === 404) {
          return sendError(reply, 404, 'NOT_FOUND', 'Not found');
        }
        req.log.warn({ err: e, key }, 's3 read-through GetObject failed');
        return sendError(reply, 500, 'INTERNAL', 'Failed to read object');
      }
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
          const userId = getAuthUser(req).id;
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
            const putMaxBytes = isVcWatchTogetherStorageKey(payload.storageKey)
              ? ECHO_WATCH_TOGETHER_MAX_VIDEO_BYTES
              : config.echoLocalUploadBodyMaxBytes;
            await writeLocalEchoUploadFileStream(
              payload.storageKey,
              stream,
              payload.contentLength,
              putMaxBytes,
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
    { bodyLimit: ECHO_WATCH_TOGETHER_MAX_VIDEO_BYTES },
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
      const userId = getAuthUser(req).id;

      const objectKeyRaw =
        typeof req.body?.key === 'string' ? req.body.key : '';
      const objectKey = sanitizeEchoUploadObjectKeyFragment(objectKeyRaw);
      const contentType = sanitizeUploadContentType(
        typeof req.body?.contentType === 'string' ? req.body.contentType : '',
      );
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
      const purpose = req.body?.purpose;
      const channelId =
        typeof req.body?.channelId === 'string'
          ? req.body.channelId.trim()
          : '';
      const serverId =
        typeof req.body?.serverId === 'string' ? req.body.serverId.trim() : '';

      if (purpose === 'vc_watch_together') {
        if (ent.plan === 'free') {
          return sendError(
            reply,
            403,
            'ECHO_PLUS_REQUIRED',
            'Echo+ is required to host Watch Together uploads',
          );
        }
        if (!config.echoLocalUploadDir) {
          return sendError(
            reply,
            503,
            'UPLOADS_NOT_CONFIGURED',
            'Watch Together requires local uploads (ECHO_LOCAL_UPLOAD_DIR)',
          );
        }
        const sessionId =
          typeof req.body?.sessionId === 'string'
            ? req.body.sessionId.trim()
            : '';
        if (!sessionId) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'sessionId required for vc_watch_together presign',
          );
        }
        if (
          !Number.isFinite(contentLength) ||
          contentLength < 1 ||
          contentLength > ECHO_WATCH_TOGETHER_MAX_VIDEO_BYTES
        ) {
          return sendError(reply, 400, 'UPLOAD_TOO_LARGE', 'File too large');
        }
        const quota = await assertVcWatchTogetherSessionQuota(pool, {
          sessionId,
          hostUserId: userId,
          channelId,
          additionalBytes: contentLength,
        });
        if (!quota.ok) {
          return sendError(
            reply,
            400,
            'UPLOAD_SESSION_QUOTA',
            `Watch Together session limit is ${ECHO_WATCH_TOGETHER_MAX_SESSION_BYTES} bytes`,
          );
        }
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
        await insertEchoUploadIntent(pool, {
          storageKey,
          uploaderId: userId,
          channelId: channelId || undefined,
          serverId: serverId || undefined,
          purpose,
          contentType,
          declaredByteLength: contentLength,
        });
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

      const useLocalDisk =
        !isEchoS3UploadConfigured() && Boolean(config.echoLocalUploadDir);
      let effectiveCap = useLocalDisk
        ? Math.min(ent.uploadMaxBytes, config.echoLocalUploadBodyMaxBytes)
        : ent.uploadMaxBytes;
      if (purpose === 'user_ringtone') {
        effectiveCap = Math.min(effectiveCap, ECHO_RINGTONE_UPLOAD_MAX_BYTES);
      }

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

      const channelIdLegacy =
        typeof req.body?.channelId === 'string'
          ? req.body.channelId.trim()
          : '';
      const serverIdLegacy =
        typeof req.body?.serverId === 'string' ? req.body.serverId.trim() : '';

      const dest = await resolveEchoUploadStorageKey(pool, userId, {
        channelId: channelIdLegacy,
        serverId: serverIdLegacy,
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

      await insertEchoUploadIntent(pool, {
        storageKey,
        uploaderId: userId,
        channelId: channelIdLegacy || undefined,
        serverId: serverIdLegacy || undefined,
        purpose: purpose ?? undefined,
        contentType,
        declaredByteLength: contentLength,
      });

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
          max: 20,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const userId = getAuthUser(req).id;
      const body = req.body;

      const sha256Hex =
        typeof body?.sha256Hex === 'string' ? body.sha256Hex.trim() : '';
      const phashHex =
        typeof body?.phashHex === 'string' ? body.phashHex.trim() : '';
      const kind = body?.kind;
      const contentType = sanitizeUploadContentType(
        typeof body?.contentType === 'string' ? body.contentType : '',
        '',
      );

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
    sessionId?: string;
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
      const userId = getAuthUser(req).id;
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
      const contentType = sanitizeUploadContentType(
        typeof body?.contentType === 'string' ? body.contentType : '',
        '',
      );
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

      const registrationGate = await verifyEchoUploadReadyToRegister(pool, {
        storageKey: storageKeyClient,
        uploaderId: userId,
        contentType,
        byteLength,
      });
      if (!registrationGate.ok) {
        return sendError(
          reply,
          registrationGate.httpStatus,
          registrationGate.code,
          registrationGate.message,
        );
      }

      const safetyLog = {
        warn: (o: unknown, m?: string) => req.log.warn(o, m),
        info: (o: unknown, m?: string) => req.log.info(o, m),
      };
      const safety = await runEchoUploadIntegrityRegisterStep({
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

      await markEchoUploadIntentRegistered(
        pool,
        storageKeyClient,
        registrationGate.declaredByteLength,
      );

      await registerChatUploadRetention(pool, {
        storageKey: storageKeyClient,
        byteLength,
        sourceType: 'user',
        uploaderId: userId,
      });

      if (
        kind === 'video' &&
        (channelIdReg || isVcWatchTogetherStorageKey(storageKeyClient))
      ) {
        const sourceMeta = (await readEchoUploadSourceMetadata(
          storageKeyClient,
        )) ?? {
          size: byteLength,
          etag: `${byteLength}`,
        };
        await enqueueEchoChatVideoHls(pool, {
          storageKey: storageKeyClient,
          publicUrl,
          sourceContentType: contentType,
          sourceSize: sourceMeta.size,
          sourceEtag: sourceMeta.etag,
        });
        kickVideoUploadOptimizeJob();
      }

      if (
        isVcWatchTogetherStorageKey(storageKeyClient) &&
        body.purpose === 'vc_watch_together'
      ) {
        const sessionId =
          typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
        if (sessionId && channelIdReg) {
          await addVcWatchTogetherSessionBytes(pool, {
            sessionId,
            hostUserId: userId,
            channelId: channelIdReg,
            byteLength,
          });
        }
      }

      return reply.code(204).send();
    },
  );

  type EchoUploadRegisterBody = {
    channelId?: string;
    serverId?: string;
    purpose?: EchoPresignBody['purpose'];
    contentType?: string;
    objectKey?: string;
    storageKey?: string;
    byteLength?: number;
  };

  fastify.post<{ Body: EchoUploadRegisterBody }>(
    '/uploads/register',
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
      const userId = getAuthUser(req).id;
      const body = req.body;

      const objectKeyRaw =
        typeof body?.objectKey === 'string' ? body.objectKey : '';
      const objectKey = sanitizeEchoUploadObjectKeyFragment(objectKeyRaw);
      const storageKeyClient =
        typeof body?.storageKey === 'string' ? body.storageKey.trim() : '';
      const contentType = sanitizeUploadContentType(
        typeof body?.contentType === 'string' ? body.contentType : '',
        '',
      );
      const byteLength =
        typeof body?.byteLength === 'number' && Number.isFinite(body.byteLength)
          ? body.byteLength
          : 0;

      if (!objectKey || !storageKeyClient || !contentType || byteLength < 1) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'objectKey, storageKey, contentType, and byteLength are required',
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

      const registrationGate = await verifyEchoUploadReadyToRegister(pool, {
        storageKey: storageKeyClient,
        uploaderId: userId,
        contentType,
        byteLength,
      });
      if (!registrationGate.ok) {
        return sendError(
          reply,
          registrationGate.httpStatus,
          registrationGate.code,
          registrationGate.message,
        );
      }

      await markEchoUploadIntentRegistered(
        pool,
        storageKeyClient,
        registrationGate.declaredByteLength,
      );

      await registerChatUploadRetention(pool, {
        storageKey: storageKeyClient,
        byteLength: registrationGate.declaredByteLength,
        sourceType: 'user',
        uploaderId: userId,
      });

      return reply.code(204).send();
    },
  );

  type EchoVideoPlaybackQuery = { url?: string };

  fastify.get<{ Querystring: EchoVideoPlaybackQuery }>(
    '/uploads/video-playback',
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
      const rawUrl = req.query.url?.trim();
      if (!rawUrl) {
        return sendError(reply, 400, 'INVALID_BODY', 'url query required');
      }
      const sourceKey = extractStorageKeyFromEchoMediaUrl(rawUrl);
      if (!sourceKey) {
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid media url');
      }
      const canRead = await canUserReadLocalUploadStorageKey(req, sourceKey);
      if (!canRead) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to read this upload',
        );
      }
      if (!(await assertChatUploadNotRetentionExpired(req, sourceKey))) {
        return sendError(reply, 404, 'NOT_FOUND', 'Not found');
      }
      const pool = getPgPool();
      const sourceUrl =
        buildEchoUploadPublicUrlForStorageKey(sourceKey) ?? rawUrl;
      const base = {
        sourceUrl,
        sourceSize: 0,
        sourceEtag: null as string | null,
      };
      if (!pool) {
        return reply
          .code(200)
          .header('Cache-Control', 'private, no-store')
          .send({ status: 'pending', format: 'progressive', ...base });
      }
      const row = await getEchoVideoPlaybackBySourceKey(pool, sourceKey);
      if (!row) {
        return reply
          .code(200)
          .header('Cache-Control', 'private, no-store')
          .send({ status: 'pending', format: 'progressive', ...base });
      }
      base.sourceSize = Number(row.source_size) || 0;
      base.sourceEtag = row.source_etag;
      const renditions = (row.renditions ?? []) as EchoVideoPlaybackRendition[];
      if (row.status === 'ready' && row.manifest_storage_key) {
        const playbackUrl =
          buildEchoUploadPublicUrlForStorageKey(row.manifest_storage_key) ??
          null;
        if (playbackUrl) {
          return reply
            .code(200)
            .header('Cache-Control', 'private, max-age=30')
            .send({
              status: 'ready',
              format: 'hls',
              playbackUrl,
              renditions,
              ...base,
            });
        }
      }
      if (row.status === 'processing') {
        return reply
          .code(200)
          .header('Cache-Control', 'private, no-store')
          .send({
            status: 'processing',
            format: 'progressive',
            ...base,
          });
      }
      if (row.status === 'failed') {
        return reply
          .code(200)
          .header('Cache-Control', 'private, no-store')
          .send({
            status: 'failed',
            format: 'progressive',
            lastError: row.last_error ?? null,
            ...base,
          });
      }
      return reply
        .code(200)
        .header('Cache-Control', 'private, no-store')
        .send({
          status: 'pending',
          format: 'progressive',
          ...base,
        });
    },
  );

  fastify.post<{ Body: { sessionId?: string; byteLength?: number } }>(
    '/uploads/vc-watch-together/release-bytes',
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
      const userId = getAuthUser(req).id;
      const sessionId =
        typeof req.body?.sessionId === 'string'
          ? req.body.sessionId.trim()
          : '';
      const byteLength =
        typeof req.body?.byteLength === 'number' &&
        Number.isFinite(req.body.byteLength)
          ? Math.floor(req.body.byteLength)
          : 0;
      if (!sessionId || byteLength < 1) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'sessionId and byteLength required',
        );
      }
      const released = await releaseVcWatchTogetherSessionBytes(pool, {
        sessionId,
        hostUserId: userId,
        byteLength,
      });
      if (!released.ok) {
        if (released.code === 'NOT_HOST') {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Not the Watch Together session host',
          );
        }
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid release request');
      }
      return reply.code(204).send();
    },
  );

  fastify.post<{ Body: { url?: string } }>(
    '/uploads/video-playback/retry',
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const rawUrl = req.body?.url?.trim();
      if (!rawUrl) {
        return sendError(reply, 400, 'INVALID_BODY', 'url required');
      }
      const sourceKey = extractStorageKeyFromEchoMediaUrl(rawUrl);
      if (!sourceKey) {
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid media url');
      }
      const canRead = await canUserReadLocalUploadStorageKey(req, sourceKey);
      if (!canRead) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to read this upload',
        );
      }
      const pool = getPgPool();
      if (!pool) {
        return sendError(reply, 503, 'INTERNAL', 'Database unavailable');
      }
      const publicUrl =
        buildEchoUploadPublicUrlForStorageKey(sourceKey) ?? rawUrl;
      const ctRow = await pool.query<{ source_content_type: string }>(
        `SELECT source_content_type FROM echo_video_hls_queue WHERE storage_key = $1 LIMIT 1`,
        [sourceKey],
      );
      const sourceContentType =
        ctRow.rows[0]?.source_content_type?.trim() || 'video/mp4';
      const meta = (await readEchoUploadSourceMetadata(sourceKey)) ?? {
        size: 0,
        etag: '0',
      };
      await enqueueEchoChatVideoHls(pool, {
        storageKey: sourceKey,
        publicUrl,
        sourceContentType,
        sourceSize: meta.size,
        sourceEtag: meta.etag,
      });
      kickVideoUploadOptimizeJob();
      return reply.code(204).send();
    },
  );

  type EchoImportRemoteImageBody = { channelId?: string; url?: string };

  fastify.post<{ Body: EchoImportRemoteImageBody }>(
    '/uploads/import-remote-image',
    {
      preHandler: [requireAuth, requireEchoStore],
      bodyLimit: 16 * 1024,
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const userId = getAuthUser(req).id;
      const channelId =
        typeof req.body?.channelId === 'string'
          ? req.body.channelId.trim()
          : '';
      const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      if (!channelId || !url) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'channelId and url are required',
        );
      }
      if (url.length > 8192) {
        return sendError(reply, 400, 'INVALID_BODY', 'url too long');
      }

      const ent = await getEchoEntitlements(pool, userId);
      const useLocalDisk =
        !isEchoS3UploadConfigured() && Boolean(config.echoLocalUploadDir);
      const effectiveCap = useLocalDisk
        ? Math.min(ent.uploadMaxBytes, config.echoLocalUploadBodyMaxBytes)
        : ent.uploadMaxBytes;

      const result = await importChatRemoteImage({
        pool,
        userId,
        channelId,
        sourceUrl: url,
        maxBytes: effectiveCap,
        log: req.log,
      });
      if (!result.ok) {
        return sendError(reply, result.status, result.code, result.message);
      }
      return reply.code(200).header('Cache-Control', 'private, no-store').send({
        url: result.url,
        storageKey: result.storageKey,
        mimeType: result.mimeType,
        fileSize: result.fileSize,
      });
    },
  );

  type EchoRetentionTouchBody = { storageKeys?: string[] };

  fastify.post<{ Body: EchoRetentionTouchBody }>(
    '/uploads/retention/touch',
    {
      preHandler: [requireAuth, requireEchoStore],
      bodyLimit: 16 * 1024,
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
      const raw = req.body?.storageKeys;
      if (!Array.isArray(raw)) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'storageKeys array required',
        );
      }
      const keys = [
        ...new Set(
          raw
            .filter((k): k is string => typeof k === 'string')
            .map((k) => k.trim())
            .filter((k) => k && isEchoChatUserMediaStorageKey(k)),
        ),
      ].slice(0, 20);

      let touched = 0;
      for (const storageKey of keys) {
        const canRead = await canUserReadLocalUploadStorageKey(req, storageKey);
        if (!canRead) continue;
        await touchChatUploadRetention(pool, storageKey);
        touched += 1;
      }

      return reply
        .code(200)
        .header('Cache-Control', 'private, no-store')
        .send({ touched });
    },
  );
}
