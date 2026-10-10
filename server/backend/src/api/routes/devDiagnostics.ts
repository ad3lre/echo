import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { DiagnosticEvent } from '../../../../../contracts/diagnostics';
import { config } from '../../config';
import {
  appendFrontendDiagnosticBatch,
  getSessionDiagnosticsState,
} from '../../observability/sessionDiagnostics';

function isLocalAddress(ip: string): boolean {
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return normalized === '127.0.0.1' || normalized === '::1';
}

const devDiagnosticsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/diagnostics/ingest',
    async (
      req: FastifyRequest<{ Body: { events?: DiagnosticEvent[] } }>,
      reply,
    ) => {
      // Dev diagnostics ingest is intentionally disabled in production.
      // In development, allow ingest regardless of proxy host/ip details so
      // frontend-to-backend proxying (Vite, Docker, local reverse proxies)
      // does not cause false 403s.
      if (config.isProduction) {
        return reply.code(403).send({ error: 'Dev diagnostics disabled' });
      }

      // Use the actual peer address; Host and forwarded headers are client
      // controlled and must not grant access to local diagnostics.
      const peerAddress = req.raw.socket.remoteAddress ?? '';
      if (!isLocalAddress(peerAddress)) {
        fastify.log.warn(
          {
            peerAddress,
          },
          'dev diagnostics ingest rejected for non-local host/ip',
        );
        return reply.code(403).send({ error: 'Localhost access required' });
      }

      const events = Array.isArray(req.body?.events) ? req.body?.events : [];
      if (events.length > 100) {
        return reply.code(400).send({ error: 'Too many events (max 100)' });
      }
      if (events.length > 0) {
        await appendFrontendDiagnosticBatch(events);
      }
      const session = getSessionDiagnosticsState();
      return reply.code(204).send({
        accepted: events.length,
        sessionId: session.sessionId,
      });
    },
  );
};

export default devDiagnosticsRoutes;
