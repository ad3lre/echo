import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { getAuthUser } from '../../../auth/middleware';
import {
  countInstanceOperators,
  createInstanceBan,
  setUserInstanceOperator,
} from '../../../domain/echoStore/safety/instanceBans';
import { sendError } from '../../errors';
import { disconnectAllSocketsForAuthUser } from '../../../services/auth/socketSessionRevocation';

function parseExpiresAtMinutes(raw: unknown): Date | null {
  if (raw == null) return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return new Date(
    Date.now() + Math.min(Math.floor(raw), 365 * 24 * 60) * 60_000,
  );
}

function mapCreateBanError(reply: FastifyReply, err: unknown) {
  const msg = err instanceof Error ? err.message : '';
  if (msg === 'TARGET_REQUIRED') {
    return sendError(
      reply,
      400,
      'INVALID_BODY',
      'Provide userId, ip, or hwidHash',
    );
  }
  if (msg === 'REASON_REQUIRED') {
    return sendError(reply, 400, 'INVALID_BODY', 'reason is required');
  }
  throw err;
}

export async function postInstanceBanHandler(
  fastify: FastifyInstance,
  pool: pg.Pool,
  req: FastifyRequest<{
    Body: {
      reason?: string;
      userId?: string;
      ip?: string;
      hwidHash?: string;
      expiresAtMinutes?: number;
      isAllowlisted?: boolean;
      includeLastSeenIp?: boolean;
      includeKnownHwid?: boolean;
    };
  }>,
  reply: FastifyReply,
) {
  const reason =
    typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) {
    return sendError(reply, 400, 'INVALID_BODY', 'reason is required');
  }
  try {
    const bans = await createInstanceBan(pool, {
      reason,
      userId: req.body?.userId?.trim() || null,
      rawIp: req.body?.ip?.trim() || null,
      hwidHash: req.body?.hwidHash?.trim() || null,
      expiresAt: parseExpiresAtMinutes(req.body?.expiresAtMinutes),
      isAllowlisted: Boolean(req.body?.isAllowlisted),
      includeLastSeenIp: req.body?.includeLastSeenIp,
      includeKnownHwid: req.body?.includeKnownHwid,
      bannedBy: getAuthUser(req).id,
    });
    const targetUserId = req.body?.userId?.trim();
    if (targetUserId && !req.body?.isAllowlisted) {
      await disconnectAllSocketsForAuthUser(
        fastify,
        targetUserId,
        'instance_ban',
      );
    }
    return reply.code(201).send({ bans });
  } catch (err) {
    return mapCreateBanError(reply, err);
  }
}

export async function deleteInstanceOperatorHandler(
  pool: pg.Pool,
  req: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) {
  const userId = req.params.userId?.trim();
  if (!userId) {
    return sendError(reply, 400, 'INVALID_BODY', 'userId required');
  }
  const actor = getAuthUser(req);
  if (userId === actor.id) {
    const operatorCount = await countInstanceOperators(pool);
    if (operatorCount <= 1) {
      return sendError(
        reply,
        400,
        'INVALID_BODY',
        'Cannot demote the last instance operator',
      );
    }
  }
  const target = await pool.query(
    `SELECT is_instance_operator FROM auth_users WHERE id = $1`,
    [userId],
  );
  if (!target.rows[0]) {
    return sendError(reply, 404, 'NOT_FOUND', 'User not found');
  }
  if (!target.rows[0].is_instance_operator) {
    return reply.code(204).send();
  }
  const ok = await setUserInstanceOperator(pool, userId, false, actor.id);
  if (!ok) {
    return sendError(reply, 404, 'NOT_FOUND', 'User not found');
  }
  return reply.code(204).send();
}
