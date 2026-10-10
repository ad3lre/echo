import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import Fastify from 'fastify';
import type { FastifyBaseLogger } from 'fastify';
import type { Handshake } from 'socket.io/dist/socket-types';
function stub(path: string, exports: object): void {
  require.cache[require.resolve(path)] = { exports } as NodeModule;
}
const secret = 'test-only-secret-for-token-isolation';
const config = {
  jwtSecret: secret,
  authNativeBearer: true,
  authLegacyBearer: true,
};
stub('../config', { config });
let activeSession = false;
stub('./serverSession', {
  SESSION_COOKIE: 'echo_sid',
  LEGACY_SESSION_COOKIE: 'legacy_sid',
  getServerSession: async () =>
    activeSession ? { userId: 'victim', refreshTokenId: 'refresh' } : null,
  deleteServerSession: async () => {},
  touchServerSession: async () => {},
});
stub('./store', {
  getAuthStore: async () => ({
    store: {
      getUserById: async () => ({
        id: 'victim',
        username: 'victim',
        isGuest: false,
      }),
      findRefreshTokenById: async () => ({ userId: 'victim' }),
    },
  }),
});
stub('../domain/instanceBanEnforcement', {
  replyIfInstanceBanned: async () => false,
  checkInstanceBanBlocked: async () => ({ blocked: false }),
});
const { requireAuth } =
  require('./middleware') as typeof import('./middleware');
const { resolveSocketIdentity } =
  require('../sockets/resolveSocketIdentity') as typeof import('../sockets/resolveSocketIdentity');
const native = jwt.sign(
  { sub: 'victim', username: 'victim', sid: 'revoked', typ: 'native_session' },
  secret,
  { expiresIn: '5m' },
);
const legacy = jwt.sign({ sub: 'victim', username: 'victim' }, secret, {
  expiresIn: '5m',
});
const game = jwt.sign(
  { sub: 'victim', username: 'victim', roomId: 'room', gameKey: 'tic_tac_toe' },
  secret,
  { expiresIn: '5m' },
);
const log = { warn() {} } as unknown as FastifyBaseLogger;
function socketIdentity(token: string) {
  return resolveSocketIdentity(
    { auth: { token }, headers: {}, address: '127.0.0.1' } as Handshake,
    log,
    'socket',
  );
}

test('revoked native tokens cannot downgrade to legacy HTTP authentication', async () => {
  const app = Fastify();
  app.get('/private', { preHandler: requireAuth }, async () => ({ ok: true }));
  try {
    assert.equal(
      (
        await app.inject({
          url: '/private',
          headers: { authorization: `Bearer ${native}` },
        })
      ).statusCode,
      401,
    );
    activeSession = true;
    assert.equal(
      (
        await app.inject({
          url: '/private',
          headers: { authorization: `Bearer ${native}` },
        })
      ).statusCode,
      200,
    );
    activeSession = false;
    config.authNativeBearer = false;
    for (const token of [native, game]) {
      assert.equal(
        (
          await app.inject({
            url: '/private',
            headers: { authorization: `Bearer ${token}` },
          })
        ).statusCode,
        401,
      );
    }
    assert.equal(
      (
        await app.inject({
          url: '/private',
          headers: { authorization: `Bearer ${legacy}` },
        })
      ).statusCode,
      200,
    );
  } finally {
    activeSession = false;
    config.authNativeBearer = true;
    await app.close();
  }
});

test('socket legacy fallback rejects revoked native and room-scoped game tokens', async () => {
  assert.equal((await socketIdentity(native)).authenticated, false);
  assert.equal((await socketIdentity(game)).authenticated, false);
  assert.equal((await socketIdentity(legacy)).authenticated, true);
  activeSession = true;
  try {
    const identity = await socketIdentity(native);
    assert.equal(identity.authenticated, true);
    assert.equal(identity.authSessionId, 'revoked');
  } finally {
    activeSession = false;
  }
});
