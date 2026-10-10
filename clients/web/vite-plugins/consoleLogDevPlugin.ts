import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

const MAX_CONSOLE_LOG_ENTRIES = 150;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_FIELD_CHARS = 4096;

type ConsoleLogEntry = {
  timestamp: string;
  level: 'warn' | 'error';
  kind: 'console' | 'window_error' | 'unhandled_rejection';
  message: string;
  details?: unknown[];
  href?: string;
  userAgent?: string;
};

type ConsoleLogFile = {
  updatedAt: string;
  entries: ConsoleLogEntry[];
};

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new RangeError('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const parsed: unknown = JSON.parse(raw || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new Error('invalid json object');
        resolve(parsed as Record<string, unknown>);
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function isConsoleLevel(value: unknown): value is 'warn' | 'error' {
  return value === 'warn' || value === 'error';
}

function isConsoleKind(
  value: unknown,
): value is 'console' | 'window_error' | 'unhandled_rejection' {
  return (
    value === 'console' ||
    value === 'window_error' ||
    value === 'unhandled_rejection'
  );
}

function sanitizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.slice(0, MAX_FIELD_CHARS) : fallback;
}

function sanitizeDetails(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 20).map((item: unknown) => {
    const serialized = JSON.stringify(item) ?? '';
    return serialized.length > MAX_FIELD_CHARS
      ? serialized.slice(0, MAX_FIELD_CHARS)
      : item;
  });
}

function readConsoleLogFile(filePath: string): ConsoleLogFile {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ConsoleLogFile>;
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.filter(
          (entry): entry is ConsoleLogEntry =>
            !!entry &&
            typeof entry === 'object' &&
            typeof (entry as ConsoleLogEntry).timestamp === 'string' &&
            isConsoleLevel((entry as ConsoleLogEntry).level) &&
            isConsoleKind((entry as ConsoleLogEntry).kind) &&
            typeof (entry as ConsoleLogEntry).message === 'string',
        )
      : [];
    return {
      updatedAt:
        typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : new Date().toISOString(),
      entries: entries.slice(-MAX_CONSOLE_LOG_ENTRIES),
    };
  } catch {
    return { updatedAt: new Date().toISOString(), entries: [] };
  }
}

function writeConsoleLogFile(filePath: string, entry: ConsoleLogEntry): void {
  const current = readConsoleLogFile(filePath);
  const next: ConsoleLogFile = {
    updatedAt: new Date().toISOString(),
    entries: [...current.entries, entry].slice(-MAX_CONSOLE_LOG_ENTRIES),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

export function consoleLogDevPlugin(repoRoot: string): Plugin {
  const outputFile = path.join(repoRoot, 'console-log.json');

  return {
    name: 'echo-console-log-dev',
    apply: 'serve',
    configureServer(server) {
      if (!fs.existsSync(outputFile)) {
        fs.writeFileSync(
          outputFile,
          `${JSON.stringify(
            {
              updatedAt: new Date().toISOString(),
              entries: [],
            } satisfies ConsoleLogFile,
            null,
            2,
          )}\n`,
          'utf8',
        );
      }

      server.middlewares.use('/__dev/console-log', async (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        const address = req.socket.remoteAddress ?? '';
        const local =
          address === '::1' ||
          /^::ffff:127\./.test(address) ||
          /^127\./.test(address);
        const origin = req.headers.origin;
        let originMatches = !origin;
        try {
          if (origin) originMatches = new URL(origin).host === req.headers.host;
        } catch {
          /* invalid origin */
        }
        if (!local || !originMatches) {
          res.statusCode = 403;
          res.end(JSON.stringify({ ok: false, error: 'Local clients only' }));
          return;
        }

        let body: Record<string, unknown>;
        try {
          body = await readJsonBody(req);
        } catch (error) {
          res.statusCode = error instanceof RangeError ? 413 : 400;
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
          return;
        }

        const level = body.level;
        const kind = body.kind;
        const message = sanitizeString(body.message).trim();
        if (!isConsoleLevel(level) || !isConsoleKind(kind) || !message) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              ok: false,
              error:
                'Expected { level: "warn"|"error", kind, message } in request body',
            }),
          );
          return;
        }

        const entry: ConsoleLogEntry = {
          timestamp: sanitizeString(body.timestamp, new Date().toISOString()),
          level,
          kind,
          message,
          ...(sanitizeDetails(body.details)
            ? { details: sanitizeDetails(body.details) }
            : {}),
          ...(sanitizeString(body.href).trim()
            ? { href: sanitizeString(body.href).trim() }
            : {}),
          ...(sanitizeString(body.userAgent).trim()
            ? { userAgent: sanitizeString(body.userAgent).trim() }
            : {}),
        };

        try {
          writeConsoleLogFile(outputFile, entry);
        } catch (error) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Could not write console log file',
            }),
          );
          return;
        }

        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
      });
    },
  };
}
