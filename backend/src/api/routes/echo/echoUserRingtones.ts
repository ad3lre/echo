import rateLimit from '@fastify/rate-limit';
import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
} from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import { getAccessUserIdFromAuthHeader } from '../../../auth/token';
import {
  countEchoUserRingtones,
  deleteEchoUserRingtone,
  insertEchoUserRingtone,
  isEchoUserRingtoneStorageKeyForUser,
  listEchoUserRingtones,
} from '../../../domain/echoStore';
import { getEchoEntitlements } from '../../../domain/echoPlanEntitlements';
import { extractStorageKeyFromEchoMediaUrl } from '../../../services/echoEmojiAsset';
import { purgeEchoUploadObject } from '../../../services/csamScan';
import { isAllowedRingtoneUploadContentType } from '../../../services/s3UploadPresign';
import {
  ECHO_PLAN_MAX_CUSTOM_RINGTONES,
  ECHO_RINGTONE_UPLOAD_MAX_BYTES,
} from '../../../../../shared/echoPlanLimits';
import { sendError } from '../../errors';
import { echoPool, requireEchoStore } from './echoRouteUtils';

type RegisterRingtoneBody = {
  label?: string;
  storageKey?: string;
  publicUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
};

function maxCustomRingtonesForPlan(
  plan: keyof typeof ECHO_PLAN_MAX_CUSTOM_RINGTONES,
): number {
  return (
    ECHO_PLAN_MAX_CUSTOM_RINGTONES[plan] ?? ECHO_PLAN_MAX_CUSTOM_RINGTONES.free
  );
}

function extlessLabel(name: string): string {
  const base = name.replace(/\.[^/.]+$/, '').trim();
  return base.slice(0, 120) || 'Custom ringtone';
}

export default async function echoUserRingtonesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 60,
      timeWindow: '1 minute',
      keyGenerator: (req: FastifyRequest) => {
        const uid = getAccessUserIdFromAuthHeader(req.headers.authorization);
        return uid ? `echo_ringtones:${uid}` : `echo_ringtones:ip:${req.ip}`;
      },
    });

    scope.get(
      '/ringtones',
      { preHandler: [requireAuth, requireEchoStore] },
      async (req, reply) => {
        if (req.authUser?.isGuest) {
          return reply.send({ ringtones: [], maxCustom: 0 });
        }
        const pool = echoPool(req);
        const userId = req.authUser!.id;
        const ent = await getEchoEntitlements(pool, userId);
        const rows = await listEchoUserRingtones(pool, userId);
        return reply.send({
          maxCustom: maxCustomRingtonesForPlan(ent.plan),
          ringtones: rows.map((r) => ({
            id: r.id,
            label: r.label,
            url: r.publicUrl,
            mimeType: r.mimeType,
            sizeBytes: r.sizeBytes,
            createdAt: r.createdAt,
          })),
        });
      },
    );

    scope.post<{ Body: RegisterRingtoneBody }>(
      '/ringtones',
      {
        preHandler: [requireAuth, requireEchoStore],
        bodyLimit: 16 * 1024,
        config: {
          rateLimit: {
            max: 20,
            timeWindow: '1 hour',
            keyGenerator: (req: FastifyRequest) => {
              const uid = getAccessUserIdFromAuthHeader(
                req.headers.authorization,
              );
              return uid
                ? `echo_ringtones_register:${uid}`
                : `echo_ringtones_register:ip:${req.ip}`;
            },
          },
        },
      },
      async (req, reply) => {
        if (req.authUser?.isGuest) {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Sign in with a full account to save custom ringtones.',
          );
        }
        const pool = echoPool(req);
        const userId = req.authUser!.id;
        const ent = await getEchoEntitlements(pool, userId);
        const maxCustom = maxCustomRingtonesForPlan(ent.plan);
        const count = await countEchoUserRingtones(pool, userId);
        if (count >= maxCustom) {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            `Custom ringtone limit reached (${maxCustom}).`,
          );
        }

        const storageKey =
          typeof req.body?.storageKey === 'string'
            ? req.body.storageKey.trim()
            : '';
        const publicUrl =
          typeof req.body?.publicUrl === 'string'
            ? req.body.publicUrl.trim()
            : '';
        if (!storageKey || !publicUrl) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'storageKey and publicUrl required',
          );
        }
        if (!isEchoUserRingtoneStorageKeyForUser(storageKey, userId)) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'storageKey does not match this user',
          );
        }
        const keyFromUrl = extractStorageKeyFromEchoMediaUrl(publicUrl);
        if (!keyFromUrl || keyFromUrl !== storageKey) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'publicUrl does not match storageKey',
          );
        }

        const mimeType =
          typeof req.body?.mimeType === 'string' && req.body.mimeType.trim()
            ? req.body.mimeType.trim()
            : 'audio/mpeg';
        if (!isAllowedRingtoneUploadContentType(mimeType)) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Unsupported ringtone content type',
          );
        }

        const sizeBytes =
          typeof req.body?.sizeBytes === 'number' &&
          Number.isFinite(req.body.sizeBytes)
            ? Math.floor(req.body.sizeBytes)
            : 0;
        if (sizeBytes < 1 || sizeBytes > ECHO_RINGTONE_UPLOAD_MAX_BYTES) {
          return sendError(reply, 400, 'INVALID_BODY', 'Invalid sizeBytes');
        }

        const labelRaw =
          typeof req.body?.label === 'string' ? req.body.label.trim() : '';
        const label = labelRaw ? extlessLabel(labelRaw) : 'Custom ringtone';

        const row = await insertEchoUserRingtone(pool, userId, {
          label,
          storageKey,
          publicUrl,
          mimeType,
          sizeBytes,
        });

        return reply.code(201).send({
          id: row.id,
          label: row.label,
          url: row.publicUrl,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          createdAt: row.createdAt,
        });
      },
    );

    scope.delete<{ Params: { ringtoneId: string } }>(
      '/ringtones/:ringtoneId',
      { preHandler: [requireAuth, requireEchoStore] },
      async (req, reply) => {
        if (req.authUser?.isGuest) {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Sign in with a full account to manage custom ringtones.',
          );
        }
        const ringtoneId = req.params.ringtoneId?.trim();
        if (!ringtoneId) {
          return sendError(reply, 400, 'INVALID_BODY', 'ringtoneId required');
        }
        const pool = echoPool(req);
        const userId = req.authUser!.id;
        const deleted = await deleteEchoUserRingtone(pool, userId, ringtoneId);
        if (!deleted) {
          return sendError(reply, 404, 'NOT_FOUND', 'Ringtone not found');
        }
        void purgeEchoUploadObject(deleted.storageKey).catch(() => {});
        return reply.code(200).send({ ok: true });
      },
    );
  });
}
