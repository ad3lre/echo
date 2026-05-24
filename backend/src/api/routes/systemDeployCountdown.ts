import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config';
import { normalizeDeployAnnouncement } from '../../../../shared/deployAnnouncement';

type DeployCountdownBody = {
  seconds?: number;
  message?: string;
};

function readNotifySecret(req: FastifyRequest): string | null {
  const hdrRaw = req.headers['x-echo-deploy-notify-secret'];
  const hdr = Array.isArray(hdrRaw) ? hdrRaw[0] : hdrRaw;
  if (typeof hdr === 'string' && hdr.trim()) return hdr.trim();
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return null;
}

/**
 * Internal hook for the VPS launcher: fan-out a global restart warning, then the caller waits
 * before sending SIGTERM to the Node process.
 */
export default async function systemDeployCountdownRoutes(
  fastify: FastifyInstance,
) {
  fastify.post(
    '/system/deploy-countdown',
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!config.echoDeployNotifySecret) {
        return reply.code(404).send({
          code: 'NOT_ENABLED',
          message:
            'Deploy countdown is not configured (set ECHO_DEPLOY_NOTIFY_SECRET on the API).',
        });
      }
      const provided = readNotifySecret(req);
      if (!provided || provided !== config.echoDeployNotifySecret) {
        return reply.code(401).send({
          code: 'UNAUTHORIZED',
          message: 'Invalid or missing deploy notify secret.',
        });
      }

      const body = (req.body ?? {}) as DeployCountdownBody;
      let seconds = 6;
      if (
        typeof body.seconds === 'number' &&
        Number.isFinite(body.seconds) &&
        body.seconds > 0
      ) {
        seconds = Math.min(120, Math.max(1, Math.floor(body.seconds)));
      }

      let message =
        'Echo is restarting for an update. Expect a short downtime; the app will reconnect automatically.';
      if (body.message != null) {
        try {
          const normalized = normalizeDeployAnnouncement(body.message);
          if (normalized) message = normalized;
        } catch (err) {
          const detail =
            err instanceof Error ? err.message : 'Invalid deploy announcement';
          return reply.code(400).send({
            code: 'INVALID_ANNOUNCEMENT',
            message: detail,
          });
        }
      }

      const endsAt = Date.now() + seconds * 1000;
      fastify.io.emit('app:deploy_countdown', {
        reason: 'vps_restart',
        message,
        endsAt,
        secondsTotal: seconds,
      });

      fastify.log.info(
        { endsAt, seconds },
        'system.deploy_countdown_broadcast',
      );
      return reply.code(204).send();
    },
  );
}
