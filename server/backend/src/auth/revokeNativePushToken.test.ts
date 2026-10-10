import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { buildEchoTestApp } from '../tests/helpers/echoTestApp';
import { getEchoStore } from '../domain/echoStore';
import { closePgPool } from '../db/pg';
import { listIosDeviceTokensForUser } from '../domain/iosDeviceTokenRepo';

test(
  'logout removes its account APNs binding and cannot remove another account binding',
  { skip: !process.env.DATABASE_URL },
  async () => {
    const { pool } = await getEchoStore();
    assert.ok(pool);
    const app = await buildEchoTestApp();
    const register = async () => {
      const name = `push_${randomUUID().slice(0, 8)}`;
      const response = await app.fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          username: name,
          email: `${name}@echo.test`,
          password: 'password123',
          displayName: 'Push Test',
        },
      });
      assert.equal(response.statusCode, 201, response.body);
      const body = response.json();
      const cookie = response.cookies
        .map((value) => `${value.name}=${value.value}`)
        .join('; ');
      const headers = { cookie, 'x-csrf-token': body.csrfToken };
      return { body, headers };
    };
    try {
      const first = await register();
      const second = await register();
      const token1 = '11'.repeat(32),
        token2 = '22'.repeat(32);
      for (const [account, deviceToken] of [
        [first, token1],
        [second, token2],
      ] as const) {
        const result = await app.fastify.inject({
          method: 'POST',
          url: '/api/v1/auth/push/register',
          headers: account.headers,
          payload: { deviceToken },
        });
        assert.equal(result.statusCode, 204, result.body);
      }
      const logout = await app.fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: first.headers,
        payload: { pushDeviceToken: token1 },
      });
      assert.equal(logout.statusCode, 200, logout.body);
      assert.deepEqual(
        await listIosDeviceTokensForUser(pool, first.body.user.id),
        [],
      );
      const third = await register();
      const foreignLogout = await app.fastify.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: third.headers,
        payload: { pushDeviceToken: token2 },
      });
      assert.equal(foreignLogout.statusCode, 200, foreignLogout.body);
      assert.equal(
        (await listIosDeviceTokensForUser(pool, second.body.user.id))[0]
          ?.deviceToken,
        token2,
      );
    } finally {
      await app.close();
      await closePgPool();
    }
  },
);
