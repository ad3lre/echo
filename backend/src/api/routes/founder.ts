import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import fsSync from 'fs';
import rateLimit from '@fastify/rate-limit';
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { config } from '../../config';
import { sendError } from '../errors';
import { getAuthStore } from '../../auth/store';
import { getPgPool } from '../../db/pg';
import { getNatsConnection } from '../../db/nats';
import { getEchoMetricsRegistry } from '../../observability/echoMetrics';
import { getSessionDiagnosticsState } from '../../observability/sessionDiagnostics';
import { getRecentNetworkDiagnostics } from '../../observability/networkDiagnostics';

const FOUNDER_COOKIE = 'echo_founder_session';
const FOUNDER_AUDIENCE = 'echo-founder';
const FOUNDER_ISSUER = 'echo-founder';
const FOUNDER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const MAX_LOCAL_LOG_PREVIEW_CHARS = 8000;
const MAX_LOCAL_LOG_LINES = 80;

type FounderJwtPayload = {
  role: 'founder';
  username: string;
  iss: string;
  aud: string;
  exp: number;
};

type FounderLoginBody = {
  username?: string;
  password?: string;
};

type FounderLogPreview = {
  name: string;
  relativePath: string;
  sizeBytes: number;
  updatedAt: string;
  preview: string;
};

type FounderMonitoringFile = {
  name: string;
  relativePath: string;
  sizeBytes: number;
  updatedAt: string;
};

declare module 'fastify' {
  interface FastifyRequest {
    founderSession?: FounderJwtPayload;
  }
}

function founderEnabled(): boolean {
  return !!config.founderName?.trim() && !!config.founderPass?.trim();
}

function founderSessionSecret(): string {
  return config.founderSessionSecret;
}

function signHmac(input: string): string {
  return crypto
    .createHmac('sha256', founderSessionSecret())
    .update(input)
    .digest('base64url');
}

function safeCompare(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) return false;
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

function signFounderSession(username: string): string {
  const payload = {
    role: 'founder',
    username,
    iss: FOUNDER_ISSUER,
    aud: FOUNDER_AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + FOUNDER_SESSION_MAX_AGE_SECONDS,
  } satisfies FounderJwtPayload;
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  return `${encoded}.${signHmac(encoded)}`;
}

function verifyFounderSessionToken(token: string): FounderJwtPayload | null {
  try {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return null;
    if (!safeCompare(signHmac(encoded), signature)) return null;
    const decoded = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Partial<FounderJwtPayload>;
    if (!decoded || decoded.role !== 'founder') return null;
    if (decoded.iss !== FOUNDER_ISSUER || decoded.aud !== FOUNDER_AUDIENCE) {
      return null;
    }
    if (typeof decoded.exp !== 'number' || decoded.exp <= Date.now() / 1000) {
      return null;
    }
    const username =
      typeof decoded.username === 'string' ? decoded.username.trim() : '';
    if (!username) return null;
    return {
      role: 'founder',
      username,
      iss: FOUNDER_ISSUER,
      aud: FOUNDER_AUDIENCE,
      exp: decoded.exp,
    };
  } catch {
    return null;
  }
}

function setFounderCookie(reply: FastifyReply, username: string): void {
  reply.setCookie(FOUNDER_COOKIE, signFounderSession(username), {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: FOUNDER_SESSION_MAX_AGE_SECONDS,
  });
}

function clearFounderCookie(reply: FastifyReply): void {
  reply.clearCookie(FOUNDER_COOKIE, { path: '/' });
}

function currentFounderSession(req: FastifyRequest): FounderJwtPayload | null {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const raw = cookies?.[FOUNDER_COOKIE]?.trim();
  if (!raw) return null;
  return verifyFounderSessionToken(raw);
}

async function requireFounderAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  if (!founderEnabled()) {
    sendError(
      reply,
      503,
      'FOUNDER_DISABLED',
      'Founder dashboard credentials are not configured.',
    );
    return false;
  }
  const session = currentFounderSession(req);
  if (!session) {
    sendError(reply, 401, 'UNAUTHORIZED', 'Founder session required.');
    return false;
  }
  req.founderSession = session;
  return true;
}

function resolveRepoRootFromDir(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 12; i += 1) {
    const backendPkg = path.join(dir, 'backend', 'package.json');
    if (path.basename(dir).toLowerCase() === 'echo') return dir;
    if (fsSync.existsSync(backendPkg)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const repoRoot = resolveRepoRootFromDir(__dirname);

async function readTextPreview(filePath: string): Promise<string> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const tail = lines.slice(-MAX_LOCAL_LOG_LINES).join('\n');
    return tail.slice(-MAX_LOCAL_LOG_PREVIEW_CHARS);
  } catch {
    return '';
  }
}

async function statIfPresent(filePath: string): Promise<{
  sizeBytes: number;
  updatedAt: string;
} | null> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;
    return {
      sizeBytes: stat.size,
      updatedAt: stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

async function buildLocalLogPreview(
  relativePath: string,
): Promise<FounderLogPreview | null> {
  const absolutePath = path.join(repoRoot, relativePath);
  const stat = await statIfPresent(absolutePath);
  if (!stat) return null;
  const preview = await readTextPreview(absolutePath);
  return {
    name: path.basename(relativePath),
    relativePath,
    sizeBytes: stat.sizeBytes,
    updatedAt: stat.updatedAt,
    preview,
  };
}

async function loadLocalLogs(): Promise<FounderLogPreview[]> {
  const candidates = [
    'agent-multi-watch.log',
    'console-log.json',
    '_console-tail.json',
    'docs/reviews/STATUS_AND_PRODUCTION_READINESS.md',
  ];
  const previews = await Promise.all(
    candidates.map((relativePath) => buildLocalLogPreview(relativePath)),
  );
  return previews.filter((entry): entry is FounderLogPreview => entry != null);
}

async function loadMonitoringFiles(): Promise<FounderMonitoringFile[]> {
  const files = [
    'monitoring/README.md',
    'monitoring/grafana/echo-overview.json',
    'monitoring/prometheus/rules/echo-alerts.yml',
    'monitoring/prometheus/rules/echo-recording.yml',
    'scripts/agent-multi-watch.ps1',
    'scripts/diagnostics-latest.mjs',
    'scripts/diagnostics-summarize.mjs',
  ];
  const found = await Promise.all(
    files.map(async (relativePath) => {
      const absolutePath = path.join(repoRoot, relativePath);
      const stat = await statIfPresent(absolutePath);
      if (!stat) return null;
      return {
        name: path.basename(relativePath),
        relativePath,
        sizeBytes: stat.sizeBytes,
        updatedAt: stat.updatedAt,
      } satisfies FounderMonitoringFile;
    }),
  );
  return found.filter((entry): entry is FounderMonitoringFile => entry != null);
}

async function loadMonitoringSummary(): Promise<{
  dashboardTitle: string;
  dashboardUid: string;
  panelTitles: string[];
  alerts: string[];
  recordingRules: string[];
}> {
  const dashboardPath = path.join(
    repoRoot,
    'monitoring',
    'grafana',
    'echo-overview.json',
  );
  const alertsPath = path.join(
    repoRoot,
    'monitoring',
    'prometheus',
    'rules',
    'echo-alerts.yml',
  );
  const recordingPath = path.join(
    repoRoot,
    'monitoring',
    'prometheus',
    'rules',
    'echo-recording.yml',
  );

  let dashboardTitle = 'Echo overview';
  let dashboardUid = 'echo-overview';
  let panelTitles: string[] = [];
  try {
    const raw = await fs.readFile(dashboardPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      title?: string;
      uid?: string;
      panels?: Array<{ title?: string }>;
    };
    dashboardTitle = parsed.title?.trim() || dashboardTitle;
    dashboardUid = parsed.uid?.trim() || dashboardUid;
    panelTitles = Array.isArray(parsed.panels)
      ? parsed.panels
          .map((panel) =>
            typeof panel?.title === 'string' ? panel.title.trim() : '',
          )
          .filter(Boolean)
      : [];
  } catch {
    panelTitles = [];
  }

  const alerts = await extractYamlList(alertsPath, /^- alert:\s+(.+)$/gm);
  const recordingRules = await extractYamlList(
    recordingPath,
    /^- record:\s+(.+)$/gm,
  );

  return {
    dashboardTitle,
    dashboardUid,
    panelTitles,
    alerts,
    recordingRules,
  };
}

async function extractYamlList(
  filePath: string,
  pattern: RegExp,
): Promise<string[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return Array.from(raw.matchAll(pattern))
      .map((match) => match[1]?.trim() ?? '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function buildHealthSnapshot(): Promise<{
  status: 'ok';
  timestamp: string;
  db: string;
  nats: string;
  backendStorageMode: string;
  useMockDb: boolean;
}> {
  let db: string =
    config.backendStorageMode === 'memory' ? 'memory' : 'disconnected';
  if (config.backendStorageMode === 'postgres') {
    const pool = getPgPool();
    if (!pool) {
      db = 'disconnected';
    } else {
      try {
        await pool.query('SELECT 1');
        db = 'connected';
      } catch {
        db = 'disconnected';
      }
    }
  }

  let nats = 'none';
  if (config.natsUrl) {
    const nc = getNatsConnection();
    nats = nc && !nc.isClosed() ? 'connected' : 'disconnected';
  }

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    db,
    nats,
    backendStorageMode: config.backendStorageMode,
    useMockDb: config.useMockDb,
  };
}

async function loadBugReports(): Promise<
  Array<{
    id: string;
    body: string;
    createdAt: string;
    reporter: {
      id: string;
      username: string;
      displayName: string;
      email?: string;
    };
    attachmentUrls: string[];
    clientMeta: unknown;
    traceJson: unknown;
  }>
> {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    `
    SELECT
      br.id,
      br.body,
      br.client_meta,
      br.trace_json,
      br.attachment_urls,
      br.created_at,
      u.id AS reporter_id,
      u.username AS reporter_username,
      u.display_name AS reporter_display_name,
      u.email AS reporter_email
    FROM echo_bug_reports br
    JOIN auth_users u ON u.id = br.reporter_id
    ORDER BY br.created_at DESC
    LIMIT 100
    `,
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    body: String(row.body ?? ''),
    createdAt: new Date(row.created_at).toISOString(),
    reporter: {
      id: String(row.reporter_id),
      username: String(row.reporter_username ?? ''),
      displayName: String(row.reporter_display_name ?? ''),
      ...(row.reporter_email ? { email: String(row.reporter_email) } : {}),
    },
    attachmentUrls: Array.isArray(row.attachment_urls)
      ? row.attachment_urls.map((entry: unknown) => String(entry))
      : [],
    clientMeta: row.client_meta ?? {},
    traceJson: row.trace_json ?? {},
  }));
}

function hasCommittedVerifiedEmail(user: {
  email?: string;
  emailVerified: boolean;
}): boolean {
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  return Boolean(email) && user.emailVerified;
}

async function loadFounderDashboard() {
  const { store } = await getAuthStore();
  const users = await store.listUsers();
  const [bugReports, health, monitoringFiles, monitoringSummary, localLogs] =
    await Promise.all([
      loadBugReports(),
      buildHealthSnapshot(),
      loadMonitoringFiles(),
      loadMonitoringSummary(),
      loadLocalLogs(),
    ]);

  const diagnosticsState = getSessionDiagnosticsState();
  const metricsPreview = (await getEchoMetricsRegistry().metrics())
    .split('\n')
    .slice(0, 80)
    .join('\n');

  return {
    generatedAt: new Date().toISOString(),
    founder: {
      username: config.founderName,
      diagnosticsEnabled: diagnosticsState.enabled,
    },
    counts: {
      users: users.length,
      guests: users.filter((user) => user.isGuest).length,
      verifiedEmails: users.filter((user) => hasCommittedVerifiedEmail(user))
        .length,
      bugReports: bugReports.length,
    },
    health,
    diagnostics: diagnosticsState,
    monitoring: {
      files: monitoringFiles,
      summary: monitoringSummary,
      metricsPreview,
    },
    localLogs,
    watcherTools: monitoringFiles.filter(
      (entry) =>
        entry.relativePath.startsWith('scripts/') ||
        entry.relativePath.startsWith('monitoring/'),
    ),
    bugReports,
    users,
  };
}

const founderRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) => {
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 10,
      timeWindow: '15 minutes',
      keyGenerator: (req: FastifyRequest) => `founder:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });

    scope.get('/session', async (req, reply) => {
      const session = currentFounderSession(req);
      return reply.send({
        enabled: founderEnabled(),
        authenticated: !!session,
        username: session?.username ?? null,
      });
    });

    scope.post<{ Body: FounderLoginBody }>('/login', async (req, reply) => {
      if (!founderEnabled()) {
        return sendError(
          reply,
          503,
          'FOUNDER_DISABLED',
          'Founder dashboard credentials are not configured.',
        );
      }

      const username =
        typeof req.body?.username === 'string' ? req.body.username.trim() : '';
      const password =
        typeof req.body?.password === 'string' ? req.body.password : '';
      if (!username || !password) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'username and password are required.',
        );
      }

      const expectedUsername = config.founderName?.trim() ?? '';
      const expectedPassword = config.founderPass ?? '';
      if (
        !safeCompare(username, expectedUsername) ||
        !safeCompare(password, expectedPassword)
      ) {
        req.log.warn({ founderUsername: username }, 'founder_login_failed');
        return sendError(
          reply,
          401,
          'UNAUTHORIZED',
          'Invalid founder credentials.',
        );
      }

      setFounderCookie(reply, expectedUsername);
      req.log.info({ founderUsername: expectedUsername }, 'founder_login_ok');
      return reply.send({
        ok: true,
        username: expectedUsername,
      });
    });

    scope.post('/logout', async (req, reply) => {
      clearFounderCookie(reply);
      req.log.info(
        { founderUsername: currentFounderSession(req)?.username ?? null },
        'founder_logout',
      );
      return reply.send({ ok: true });
    });

    scope.get('/dashboard', async (req, reply) => {
      const ok = await requireFounderAuth(req, reply);
      if (!ok) return;
      return reply.send(await loadFounderDashboard());
    });

    scope.get(
      '/network-diagnostics',
      async (
        req: FastifyRequest<{
          Querystring: { traceId?: string; limit?: string };
        }>,
        reply,
      ) => {
        const ok = await requireFounderAuth(req, reply);
        if (!ok) return;
        const rawLimit = Number(req.query?.limit);
        const limit = Number.isFinite(rawLimit) ? rawLimit : undefined;
        return reply.send({
          generatedAt: new Date().toISOString(),
          traceId:
            typeof req.query?.traceId === 'string'
              ? req.query.traceId.trim() || null
              : null,
          entries: getRecentNetworkDiagnostics({
            traceId:
              typeof req.query?.traceId === 'string'
                ? req.query.traceId
                : undefined,
            limit,
          }),
        });
      },
    );
  });
};

export default founderRoutes;
