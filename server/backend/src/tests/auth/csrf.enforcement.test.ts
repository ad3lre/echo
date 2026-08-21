import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';

type CookieJar = {
  header: string;
  csrf: string;
};

function jarFromSetCookie(
  setCookie: string | string[] | undefined,
  csrfCookieName: string,
): CookieJar {
  const raw = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  const pairs: string[] = [];
  let csrf = '';
  for (const line of raw) {
    const seg = line.split(';')[0]?.trim();
    if (!seg) continue;
    pairs.push(seg);
    if (seg.startsWith(`${csrfCookieName}=`)) {
      csrf = decodeURIComponent(seg.slice(`${csrfCookieName}=`.length));
    }
  }
  return { header: pairs.join('; '), csrf };
}

async function run(): Promise<void> {
  process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
  process.env.NODE_ENV = 'development';
  process.env.ECHO_BACKEND_STORAGE = 'memory';
  process.env.DATABASE_URL = '';
  process.env.USE_MOCK_DB = '';
  process.env.ECHO_AUTH_STORE = '';
  process.env.REDIS_URL = '';
  process.env.ECHO_GUEST_ACCOUNTS_ENABLED = '1';

  const [{ default: authRoutes }, { enforceApiCsrf }, serverSession] =
    await Promise.all([
      import('../../api/routes/auth'),
      import('../../auth/csrf'),
      import('../../auth/serverSession'),
    ]);
  const { __resetAuthStoreForTests } = await import('../../auth/store');
  __resetAuthStoreForTests();
  serverSession.__resetServerSessionStoreForTests();
  const { CSRF_COOKIE } = serverSession;

  const app = Fastify({ logger: false });
  await app.register(cookie);
  app.addHook('preHandler', async (req, reply) => {
    const ok = await enforceApiCsrf(req, reply);
    if (!ok) return;
  });
  await app.register(authRoutes, { prefix: '/api/v1/auth' });

  const username = `csrf_${Date.now().toString(36)}`;
  const registerRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      username,
      password: 'password123',
      email: `${username}@echo.test`,
      displayName: 'CSRF Test',
    },
  });
  assert.equal(registerRes.statusCode, 201, registerRes.body);
  const jar = jarFromSetCookie(registerRes.headers['set-cookie'], CSRF_COOKIE);
  assert.ok(jar.header.includes('echo_sid='), jar.header);
  assert.ok(jar.csrf, 'register should set csrf cookie');

  const meRes = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { cookie: jar.header },
  });
  assert.equal(meRes.statusCode, 200, meRes.body);

  const patchNoCsrf = await app.inject({
    method: 'PATCH',
    url: '/api/v1/auth/me',
    headers: { cookie: jar.header },
    payload: { displayName: 'No CSRF' },
  });
  assert.equal(patchNoCsrf.statusCode, 403, patchNoCsrf.body);
  assert.match(patchNoCsrf.body, /CSRF_REQUIRED/);

  const patchOk = await app.inject({
    method: 'PATCH',
    url: '/api/v1/auth/me',
    headers: {
      cookie: jar.header,
      'x-csrf-token': jar.csrf,
      'content-type': 'application/json',
    },
    payload: { customStatus: 'csrf-audit-ok' },
  });
  assert.equal(patchOk.statusCode, 200, patchOk.body);

  const patchBadUsername = await app.inject({
    method: 'PATCH',
    url: '/api/v1/auth/me',
    headers: {
      cookie: jar.header,
      'x-csrf-token': jar.csrf,
      'content-type': 'application/json',
    },
    payload: { username: '!!!!bad!!!!' },
  });
  assert.equal(patchBadUsername.statusCode, 400, patchBadUsername.body);
  assert.match(patchBadUsername.body, /INVALID_USERNAME/);

  const guestMint = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/guest',
    payload: {},
  });
  assert.equal(guestMint.statusCode, 201, guestMint.body);
  const guestJar = jarFromSetCookie(
    guestMint.headers['set-cookie'],
    CSRF_COOKIE,
  );

  const upgradeNoCsrf = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/guest/upgrade',
    headers: { cookie: guestJar.header },
    payload: {
      email: `guest_${Date.now()}@echo.test`,
      password: 'password123',
    },
  });
  assert.equal(upgradeNoCsrf.statusCode, 403, upgradeNoCsrf.body);
  assert.match(upgradeNoCsrf.body, /CSRF_REQUIRED/);

  await app.close();
  console.log('csrf.enforcement: ok');
}

run().catch((err) => {
  console.error('csrf.enforcement failed', err);
  process.exit(1);
});
