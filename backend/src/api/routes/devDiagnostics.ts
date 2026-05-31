import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { DiagnosticEvent } from '../../../../shared/diagnostics';
import { config } from '../../config';
import {
  appendFrontendDiagnosticBatch,
  getSessionDiagnosticsState,
} from '../../observability/sessionDiagnostics';

function isLocalHostHeader(host: string | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return (
    h.includes('localhost') || h.includes('127.0.0.1') || h.includes('[::1]')
  );
}

function isLocalAddress(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.endsWith('127.0.0.1') ||
    ip.endsWith('::1')
  );
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

      const hostHeader = Array.isArray(req.headers.host)
        ? req.headers.host[0]
        : req.headers.host;
      if (!isLocalAddress(req.ip) && !isLocalHostHeader(hostHeader)) {
        fastify.log.warn(
          {
            ip: req.ip,
            hostHeader,
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
