import assert from 'node:assert/strict';
import path from 'node:path';
import Fastify from 'fastify';

function clearModule(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const resolved = require.resolve(id);
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete require.cache[resolved];
}

function clearHonchoRouteModules() {
  clearModule('../../config');
  for (const k of Object.keys(require.cache)) {
    if (
      k.includes(`${path.sep}backend${path.sep}src${path.sep}config.`) ||
      k.includes(
        `${path.sep}backend${path.sep}src${path.sep}api${path.sep}routes${path.sep}honchoMemory.`,
      ) ||
      k.includes(
        `${path.sep}backend${path.sep}src${path.sep}services${path.sep}honcho${path.sep}`,
      )
    ) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete require.cache[k];
    }
  }
}

async function run(): Promise<void> {
  process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
  process.env.NODE_ENV = 'test';
  process.env.ECHO_BACKEND_STORAGE = 'memory';
  process.env.DATABASE_URL = '';
  delete process.env.HONCHO_API_KEY;
  delete process.env.HONCHO_ENABLED;
  clearHonchoRouteModules();

  const { default: honchoMemoryRoutes } =
    await import('../../api/routes/honchoMemory');
  const app = Fastify({ logger: false });
  await app.register(honchoMemoryRoutes, { prefix: '/api/v1' });

  const status = await app.inject({
    method: 'GET',
    url: '/api/v1/honcho/status',
  });
  assert.equal(status.statusCode, 200);
  const statusBody = JSON.parse(status.body) as {
    enabled: boolean;
    configured: boolean;
    active: boolean;
    workspaceId: string;
  };
  assert.equal(statusBody.enabled, false);
  assert.equal(statusBody.configured, false);
  assert.equal(statusBody.active, false);
  assert.equal(statusBody.workspaceId, 'ECHO');

  const chat = await app.inject({
    method: 'POST',
    url: '/api/v1/honcho/me/chat',
    payload: { query: 'What do I like?' },
  });
  assert.equal(chat.statusCode, 503);

  await app.close();
  console.log('honchoMemoryRoute.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
