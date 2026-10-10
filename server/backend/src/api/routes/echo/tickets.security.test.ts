import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
function stub(path: string, exports: object): void {
  require.cache[require.resolve(path)] = { exports } as NodeModule;
}
let userId = 'unrelated';
let member = true;
const ticket = {
  id: 'ticket',
  serverId: 'server',
  channelId: 'private-channel',
  authorId: 'author',
  subject: 'confidential',
};
const policy = {
  isTicketHandler: async (_pool: unknown, _server: string, user: string) =>
    user === 'handler',
};
stub('../../../auth/middleware', {
  requireAuth: async () => {},
  getAuthUser: () => ({ id: userId }),
});
stub('./routeUtils', {
  requireEchoStore: async () => {},
  echoPool: () => ({}),
  trimEchoPathParam: (s: string) => s.trim(),
});
stub('../../../domain/echoStore', {
  ...policy,
  getEchoTicketById: async () => ticket,
  getEchoTicketByChannelId: async () => ticket,
});
stub('../../../domain/echoStore/community/tickets', policy);
stub('../../../domain/permissions/echoPermissions', {
  isMemberOfServer: async () => member,
});
stub('../../../platform/echoPlatformEvents', {});
const routes = require('./tickets')
  .default as typeof import('./tickets').default;

test('ticket lookups enforce the same author/handler policy', async () => {
  const app = Fastify();
  await app.register(routes);
  try {
    for (const path of [
      'ticket-by-channel/private-channel',
      'tickets/ticket',
    ]) {
      userId = 'unrelated';
      member = true;
      const denied = await app.inject(`/servers/server/${path}`);
      assert.equal(denied.statusCode, 403);
      assert.ok(!denied.body.includes('confidential'));
      for (const allowed of ['author', 'handler']) {
        userId = allowed;
        assert.equal(
          (await app.inject(`/servers/server/${path}`)).statusCode,
          200,
        );
        member = false;
        assert.equal(
          (await app.inject(`/servers/server/${path}`)).statusCode,
          403,
        );
        member = true;
      }
      assert.equal(
        (await app.inject(`/servers/other/${path}`)).statusCode,
        404,
      );
    }
  } finally {
    await app.close();
  }
});
