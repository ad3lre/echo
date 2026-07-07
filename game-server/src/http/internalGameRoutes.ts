import type { FastifyInstance } from 'fastify';
import {
  isEchoVcActivityKey,
  type EchoVcActivityKey,
} from '../../../shared/vcActivityCatalog';
import type { GameErrorReason } from '../../../shared/games';
import { verifyEchoForwardSignature } from '../auth/verifyEchoForwardSignature';
import { gameServerConfig } from '../config';
import type { RoomManager } from '../core/RoomManager';
import type { TunneledMembership } from '../realtime/tunneledMembership';

type JoinBody = {
  roomId?: string;
  gameKey?: string;
  userId?: string;
};

type ActionBody = JoinBody & {
  type?: string;
  payload?: unknown;
};

type LeaveBody = {
  roomId?: string;
  userId?: string;
};

function parseRoomUser(body: JoinBody): {
  roomId: string;
  userId: string;
  gameKey?: EchoVcActivityKey;
} | null {
  const roomId = body.roomId?.trim() ?? '';
  const userId = body.userId?.trim() ?? '';
  if (!roomId || !userId) return null;
  const gameKeyRaw = body.gameKey?.trim() ?? '';
  if (gameKeyRaw && !isEchoVcActivityKey(gameKeyRaw)) return null;
  return {
    roomId,
    userId,
    gameKey: gameKeyRaw ? (gameKeyRaw as EchoVcActivityKey) : undefined,
  };
}

function replyError(
  reply: import('fastify').FastifyReply,
  reason: GameErrorReason,
  status = 400,
) {
  return reply.status(status).send({ ok: false, reason });
}

export function registerInternalGameRoutes(
  app: FastifyInstance,
  manager: RoomManager,
  tunneled: TunneledMembership,
): void {
  const secret = gameServerConfig.echoForwardSecret;

  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  async function verify(req: import('fastify').FastifyRequest, raw: string) {
    return verifyEchoForwardSignature(req, raw, secret);
  }

  app.post('/internal/v1/game/join', async (req, reply) => {
    const raw = typeof req.body === 'string' ? req.body : '';
    if (!verify(req, raw)) return reply.status(401).send({ ok: false });
    let body: JoinBody;
    try {
      body = JSON.parse(raw) as JoinBody;
    } catch {
      return replyError(reply, 'rejected');
    }
    const parsed = parseRoomUser(body);
    if (!parsed?.gameKey) return replyError(reply, 'rejected');
    tunneled.add(parsed.roomId, parsed.userId);
    const err = manager.join(
      parsed.roomId,
      parsed.gameKey,
      parsed.userId,
      Date.now(),
    );
    if (err) {
      tunneled.remove(parsed.roomId, parsed.userId);
      return replyError(reply, err);
    }
    const snapshot = manager.getSnapshotForUser(parsed.roomId, parsed.userId);
    return reply.send({ ok: true, snapshot });
  });

  app.post('/internal/v1/game/action', async (req, reply) => {
    const raw = typeof req.body === 'string' ? req.body : '';
    if (!verify(req, raw)) return reply.status(401).send({ ok: false });
    let body: ActionBody;
    try {
      body = JSON.parse(raw) as ActionBody;
    } catch {
      return replyError(reply, 'rejected');
    }
    const parsed = parseRoomUser(body);
    if (!parsed || typeof body.type !== 'string' || !body.type.trim()) {
      return replyError(reply, 'invalid_action');
    }
    const err = manager.dispatch(
      parsed.roomId,
      parsed.userId,
      body.type,
      body.payload,
      Date.now(),
    );
    if (err) return replyError(reply, err);
    const snapshot = manager.getSnapshotForUser(parsed.roomId, parsed.userId);
    return reply.send({ ok: true, snapshot });
  });

  app.post('/internal/v1/game/leave', async (req, reply) => {
    const raw = typeof req.body === 'string' ? req.body : '';
    if (!verify(req, raw)) return reply.status(401).send({ ok: false });
    let body: LeaveBody;
    try {
      body = JSON.parse(raw) as LeaveBody;
    } catch {
      return replyError(reply, 'rejected');
    }
    const roomId = body.roomId?.trim() ?? '';
    const userId = body.userId?.trim() ?? '';
    if (!roomId || !userId) return replyError(reply, 'rejected');
    if (tunneled.remove(roomId, userId)) {
      manager.leave(roomId, userId, Date.now());
    }
    return reply.send({ ok: true });
  });
}
