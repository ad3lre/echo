/** Registered from `vite.config.ts` only when `ENABLE_NUMBERED_ICON_RENAME_TOOL` in `src/dev/echoDevTools.ts` is true. */
import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

/** Filenames like `chat-32.svg` or `user avatar-12.svg`. */
const NUMBERED_SUFFIX = /-\d+\.svg$/i;
const SAFE_NEW_BASENAME = /^[a-zA-Z0-9][a-zA-Z0-9 _.-]*$/;

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(raw || '{}') as Record<string, unknown>);
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function validateOne(
  iconsDir: string,
  fromRaw: unknown,
  toBasenameRaw: unknown,
): { ok: true; from: string; to: string } | { ok: false; error: string } {
  if (typeof fromRaw !== 'string' || typeof toBasenameRaw !== 'string') {
    return {
      ok: false,
      error: 'Each rename needs { from: string, toBasename: string }',
    };
  }
  const from = path.basename(fromRaw);
  const toBasename = toBasenameRaw.trim();
  if (from !== fromRaw || from.includes('..')) {
    return { ok: false, error: 'Invalid `from` path' };
  }
  if (!NUMBERED_SUFFIX.test(from)) {
    return { ok: false, error: '`from` must end with -<digits>.svg' };
  }
  if (!SAFE_NEW_BASENAME.test(toBasename)) {
    return {
      ok: false,
      error:
        'New name: letters/numbers/spaces/._- only; must start with alphanumeric',
    };
  }
  const to = `${toBasename}.svg`;
  if (to === from) {
    return { ok: false, error: 'New name equals old name' };
  }
  const oldPath = path.join(iconsDir, from);
  const newPath = path.join(iconsDir, to);
  if (!fs.existsSync(oldPath)) {
    return { ok: false, error: `Source not found: ${from}` };
  }
  if (fs.existsSync(newPath)) {
    return { ok: false, error: `Target already exists: ${to}` };
  }
  return { ok: true, from, to };
}

/**
 * Dev-only POST `/__dev/icon-rename` — batch rename SVGs under `src/assets/icons/`.
 * Body: `{ "renames": [{ "from": "chat-32.svg", "toBasename": "voice-channel-tab" }, ...] }`
 * All renames are validated first, then applied in order (single process, no Vite reload between steps).
 */
export function iconRenameDevPlugin(iconsDir: string): Plugin {
  return {
    name: 'echo-icon-rename-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/icon-rename', async (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        let body: Record<string, unknown>;
        try {
          body = await readJsonBody(req);
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
          return;
        }
        const rawList = body.renames;
        if (!Array.isArray(rawList) || rawList.length === 0) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              ok: false,
              error:
                'Expected non-empty { renames: [{ from, toBasename }, ...] }',
            }),
          );
          return;
        }

        const parsed: { from: string; to: string }[] = [];
        const seenFrom = new Set<string>();
        const seenTo = new Set<string>();

        for (const item of rawList) {
          if (!item || typeof item !== 'object') {
            res.statusCode = 400;
            res.end(
              JSON.stringify({ ok: false, error: 'Invalid rename entry' }),
            );
            return;
          }
          const o = item as Record<string, unknown>;
          const one = validateOne(iconsDir, o.from, o.toBasename);
          if (!one.ok) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: one.error }));
            return;
          }
          if (seenFrom.has(one.from)) {
            res.statusCode = 400;
            res.end(
              JSON.stringify({
                ok: false,
                error: `Duplicate from: ${one.from}`,
              }),
            );
            return;
          }
          if (seenTo.has(one.to)) {
            res.statusCode = 400;
            res.end(
              JSON.stringify({
                ok: false,
                error: `Duplicate target: ${one.to}`,
              }),
            );
            return;
          }
          seenFrom.add(one.from);
          seenTo.add(one.to);
          parsed.push({ from: one.from, to: one.to });
        }

        try {
          for (const { from, to } of parsed) {
            const oldPath = path.join(iconsDir, from);
            const newPath = path.join(iconsDir, to);
            fs.renameSync(oldPath, newPath);
          }
        } catch (e) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : 'Rename failed mid-batch',
            }),
          );
          return;
        }

        res.statusCode = 200;
        res.end(
          JSON.stringify({ ok: true, count: parsed.length, renames: parsed }),
        );
      });
    },
  };
}
