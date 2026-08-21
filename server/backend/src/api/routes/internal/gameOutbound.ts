import type { FastifyInstance } from 'fastify';
import {
  GAME_S2C,
  type GameEventMsg,
  type GameSnapshotMsg,
} from '../../../../../activities/cores/games';
import { config } from '../../../config';
import { verifyEchoWebhookHmac } from '../../../services/echoWebhookSignature';
import { listTunneledGameRoomMembers } from '../../../sockets/gameTunnelHandler';
import { GAME_SERVER_OUTBOUND_ROUTE_RATE } from '../../sharedMutationRateLimits';

type OutboundBody = {
  userId?: string;
  snapshot?: GameSnapshotMsg;
  event?: GameEventMsg;
  roomEvent?: GameEventMsg;
};

function parseOutbound(raw: string): OutboundBody | null {
  try {
    return JSON.parse(raw) as OutboundBody;
  } catch {
    return null;
  }
}

/**
 * Game-server → Echo backend relay for tunneled S2C (snapshots, events).
 * HMAC-verified; fans out to `echo:user:{userId}` rooms.
 */
export default async function gameOutboundRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  fastify.post(
    '/internal/game/outbound',
    { config: { rateLimit: GAME_SERVER_OUTBOUND_ROUTE_RATE } },
    async (req, reply) => {
      const secret = config.gameServerForwardSecret.trim();
      if (!secret) {
        return reply.status(503).send({ ok: false });
      }
      const raw = typeof req.body === 'string' ? req.body : '';
      if (!verifyEchoWebhookHmac(secret, raw, req)) {
        return reply.status(401).send({ ok: false });
      }
      const body = parseOutbound(raw);
      if (!body) {
        return reply.status(400).send({ ok: false });
      }

      const io = fastify.io;
      if (!io) {
        return reply.status(503).send({ ok: false });
      }

      if (body.snapshot && body.userId?.trim()) {
        io.to(`echo:user:${body.userId.trim()}`).emit(
          GAME_S2C.snapshot,
          body.snapshot,
        );
      }

      if (body.event && body.userId?.trim()) {
        io.to(`echo:user:${body.userId.trim()}`).emit(
          GAME_S2C.event,
          body.event,
        );
      }

      if (body.roomEvent?.roomId) {
        const roomId = body.roomEvent.roomId.trim();
        for (const uid of listTunneledGameRoomMembers(roomId)) {
          io.to(`echo:user:${uid}`).emit(GAME_S2C.event, body.roomEvent);
        }
      }

      return reply.send({ ok: true });
    },
  );
}
