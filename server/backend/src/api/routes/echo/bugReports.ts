import rateLimit from '@fastify/rate-limit';
import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
} from 'fastify';
import { getAuthUser, requireAuth } from '../../../auth/middleware';
import { getAccessUserIdFromAuthHeader } from '../../../auth/token';
import { insertEchoBugReport } from '../../../domain/echoStore';
import { sendBugReportSupportEmail } from '../../../services/email/echoBugReportEmail';
import { sendError } from '../../errors';
import { echoPool, requireEchoStore } from './routeUtils';

const MAX_DESCRIPTION = 8000;
const MAX_TRACE_JSON_CHARS = 1_200_000;
const MAX_ATTACHMENT_URLS = 8;

type BugReportBody = {
  description?: string;
  client?: unknown;
  trace?: unknown;
  attachmentUrls?: unknown;
};

function isHttpsUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export default async function echoBugReportsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 10,
      timeWindow: '1 hour',
      keyGenerator: (req: FastifyRequest) => {
        const uid = getAccessUserIdFromAuthHeader(req.headers.authorization);
        return uid ? `echo_bug_report:${uid}` : `echo_bug_report:ip:${req.ip}`;
      },
      addHeaders: { 'retry-after': true },
    });

    scope.post<{ Body: BugReportBody }>(
      '/bug-reports',
      {
        preHandler: [requireAuth, requireEchoStore],
        bodyLimit: 2 * 1024 * 1024,
      },
      async (req, reply) => {
        if (req.authUser?.isGuest) {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Sign in with a full account to submit bug reports.',
          );
        }
        const raw =
          typeof req.body?.description === 'string'
            ? req.body.description.trim()
            : '';
        if (!raw) {
          return sendError(reply, 400, 'INVALID_BODY', 'description required');
        }
        if (raw.length > MAX_DESCRIPTION) {
          return sendError(reply, 400, 'INVALID_BODY', 'description too long');
        }

        const traceJson = req.body?.trace ?? {};
        let traceStr: string;
        try {
          traceStr = JSON.stringify(traceJson);
        } catch {
          return sendError(reply, 400, 'INVALID_BODY', 'Invalid trace payload');
        }
        if (traceStr.length > MAX_TRACE_JSON_CHARS) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'trace payload too large',
          );
        }

        const urlsRaw = req.body?.attachmentUrls;
        const attachmentUrls: string[] = [];
        if (Array.isArray(urlsRaw)) {
          for (const u of urlsRaw) {
            if (typeof u !== 'string') continue;
            const t = u.trim();
            if (!t || !isHttpsUrl(t)) continue;
            if (t.length > 8192) continue;
            attachmentUrls.push(t);
            if (attachmentUrls.length >= MAX_ATTACHMENT_URLS) break;
          }
        }

        const pool = echoPool(req);
        const id = await insertEchoBugReport(pool, getAuthUser(req).id, {
          body: raw,
          clientMeta: req.body?.client ?? {},
          traceJson,
          attachmentUrls,
        });

        req.log.info(
          { echoBugReportId: id, reporterId: getAuthUser(req).id },
          'echo_bug_report_submitted',
        );

        const user = getAuthUser(req);
        void sendBugReportSupportEmail(req.log, {
          id,
          body: raw,
          clientMeta: req.body?.client ?? {},
          traceJson,
          attachmentUrls,
          reporter: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            ...(typeof user.email === 'string' && user.email.trim()
              ? { email: user.email.trim() }
              : {}),
          },
        });

        return reply.code(201).send({ id, ok: true });
      },
    );
  });
}
