import assert from 'node:assert/strict';
import {
  createServer,
  request,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { ViteDevServer } from 'vite';
import { consoleLogDevPlugin } from './consoleLogDevPlugin';

test('console logger limits payloads and rejects foreign origins', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'echo-console-regression-'));
  let handler: (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => unknown;
  const plugin = consoleLogDevPlugin(root);
  const configure = plugin.configureServer as (server: ViteDevServer) => void;
  configure({
    middlewares: {
      use(_path: string, middleware: typeof handler) {
        handler = middleware;
      },
    },
  } as unknown as ViteDevServer);
  const server = createServer((req, res) =>
    handler(req, res, () => {
      res.statusCode = 404;
      res.end();
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const post = (body: string, origin?: string) =>
    new Promise<number>((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path: '/__dev/console-log',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(origin ? { Origin: origin } : {}),
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode!));
        },
      );
      req.on('error', reject);
      req.end(body);
    });
  try {
    assert.equal(
      await post(
        JSON.stringify({
          level: 'warn',
          kind: 'console',
          message: 'x'.repeat(5000),
          details: ['y'.repeat(10000)],
        }),
      ),
      200,
    );
    const logged = JSON.parse(
      await readFile(path.join(root, 'console-log.json'), 'utf8'),
    );
    assert.equal(logged.entries[0].message.length, 4096);
    assert.equal(logged.entries[0].details[0].length, 4096);
    assert.equal(await post('x'.repeat(128 * 1024)), 413);
    assert.equal(await post('[]'), 400);
    assert.equal(await post('{}', 'https://foreign.example'), 403);
    assert.equal(
      JSON.parse(await readFile(path.join(root, 'console-log.json'), 'utf8'))
        .entries.length,
      1,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
