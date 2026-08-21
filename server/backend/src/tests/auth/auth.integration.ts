import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';

type CookieJar = {
  header: string;
  csrf: string;
};

function cookieValue(header: string, name: string): string {
  const part = header.split('; ').find((entry) => entry.startsWith(`${name}=`));
  return part ? part.slice(name.length + 1) : '';
}

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

/** Browser merges Set-Cookie; refresh rotation may only send `echo_rt`. */
function jarMergeSetCookie(
  prev: CookieJar,
  setCookie: string | string[] | undefined,
  csrfCookieName: string,
): CookieJar {
  const incoming = jarFromSetCookie(setCookie, csrfCookieName);
  if (!incoming.header) return prev;
  const map = new Map<string, string>();
  for (const part of prev.header.split('; ').filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    map.set(part.slice(0, eq), part.slice(eq + 1));
  }
  for (const part of incoming.header.split('; ')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    map.set(part.slice(0, eq), part.slice(eq + 1));
  }
  const header = [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  const csrfRaw = map.get(csrfCookieName);
  const csrf = csrfRaw !== undefined ? decodeURIComponent(csrfRaw) : prev.csrf;
  return { header, csrf };
}

async function run(): Promise<void> {
  process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
  // Use empty strings so dotenv does not repopulate these from a local `.env`.
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
  const { CSRF_COOKIE, SESSION_COOKIE } = serverSession;
  const { getAuthStore } = await import('../../auth/store');

  const app = Fastify({ logger: false });
  await app.register(cookie);
  app.addHook('preHandler', async (req, reply) => {
    const ok = await enforceApiCsrf(req, reply);
    if (!ok) return;
  });
  await app.register(authRoutes, { prefix: '/api/v1/auth' });

  const username = `it_${Date.now().toString(36)}`;
  const password = 'password123';
  const email = `${username}@echo.test`;

  const testUserAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const registerRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: { 'user-agent': testUserAgent },
    payload: { username, password, email, displayName: 'Integration User' },
  });
  assert.equal(
    registerRes.statusCode,
    201,
    `register failed: ${registerRes.body}`,
  );
  const registered = registerRes.json() as {
    user?: { id: string; emailVerified?: boolean; phoneVerified?: boolean };
  };
  assert.ok(registered.user?.id);
  assert.equal(typeof registered.user?.emailVerified, 'boolean');
  assert.equal(typeof registered.user?.phoneVerified, 'boolean');
  let jar = jarFromSetCookie(registerRes.headers['set-cookie'], CSRF_COOKIE);
  assert.ok(jar.header.includes('echo_sid='));
  assert.ok(jar.csrf);

  const customDomainEmailRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      username: `corp_${Date.now().toString(36)}`,
      password: 'password123',
      email: `person_${Date.now().toString(36)}@unknown-corp.invalid`,
    },
  });
  assert.equal(customDomainEmailRes.statusCode, 201, customDomainEmailRes.body);

  const invalidDisplayNameRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      username: `name_${Date.now().toString(36)}`,
      password: 'password123',
      email: `name_${Date.now().toString(36)}@echo.test`,
      displayName: '@everyone',
    },
  });
  assert.equal(
    invalidDisplayNameRes.statusCode,
    400,
    invalidDisplayNameRes.body,
  );
  assert.equal(
    (invalidDisplayNameRes.json() as { code?: string }).code,
    'INVALID_DISPLAY_NAME',
  );

  const meRes = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { cookie: jar.header },
  });
  assert.equal(meRes.statusCode, 200, `me failed: ${meRes.body}`);

  const updateRes = await app.inject({
    method: 'PATCH',
    url: '/api/v1/auth/me',
    headers: {
      cookie: jar.header,
      'x-csrf-token': jar.csrf,
      'content-type': 'application/json',
    },
    payload: {
      customStatus: 'Testing auth suite',
      bannerColor: 'linear-gradient(135deg, #7c3aed, #2563eb)',
      bannerRefractionEnabled: true,
      bannerBlurEnabled: true,
      bannerBlackoutEnabled: true,
    },
  });
  assert.equal(
    updateRes.statusCode,
    200,
    `profile update failed: ${updateRes.body}`,
  );
  const updated = updateRes.json() as {
    user: { customStatus: string; bannerRefractionEnabled: boolean };
  };
  assert.equal(updated.user.customStatus, 'Testing auth suite');
  assert.equal(updated.user.bannerRefractionEnabled, true);

  const unsafeBannerColorRes = await app.inject({
    method: 'PATCH',
    url: '/api/v1/auth/me',
    headers: {
      cookie: jar.header,
      'x-csrf-token': jar.csrf,
      'content-type': 'application/json',
    },
    payload: {
      bannerColor: 'url(https://attacker.test/profile-open)',
    },
  });
  assert.equal(
    unsafeBannerColorRes.statusCode,
    400,
    `unsafe bannerColor accepted: ${unsafeBannerColorRes.body}`,
  );
  assert.equal(
    (unsafeBannerColorRes.json() as { code?: string }).code,
    'INVALID_BODY',
  );

  const refreshRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    headers: { cookie: jar.header, 'content-type': 'application/json' },
    payload: {},
  });
  assert.equal(
    refreshRes.statusCode,
    200,
    `refresh failed: ${refreshRes.body}`,
  );
  const refreshed = refreshRes.json() as { user: { id: string } };
  assert.ok(refreshed.user?.id);
  jar = jarMergeSetCookie(jar, refreshRes.headers['set-cookie'], CSRF_COOKIE);
  assert.ok(jar.header.includes(`${SESSION_COOKIE}=`));

  const racedRefreshA = app.inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    headers: { cookie: jar.header, 'content-type': 'application/json' },
    payload: {},
  });
  const racedRefreshB = app.inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    headers: { cookie: jar.header, 'content-type': 'application/json' },
    payload: {},
  });
  const [raceA, raceB] = await Promise.all([racedRefreshA, racedRefreshB]);
  const statuses = [raceA.statusCode, raceB.statusCode].sort((a, b) => a - b);
  assert.deepEqual(statuses, [200, 401], 'exactly one refresh should win');
  const loser = raceA.statusCode === 401 ? raceA : raceB;
  assert.equal(
    (loser.json() as { code?: string }).code,
    'REFRESH_TOKEN_REUSED',
    'race loser must receive deterministic replay-style error',
  );
  const winner = raceA.statusCode === 200 ? raceA : raceB;
  jar = jarMergeSetCookie(jar, winner.headers['set-cookie'], CSRF_COOKIE);

  const sessionsRes = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/sessions',
    headers: { cookie: jar.header },
  });
  assert.equal(
    sessionsRes.statusCode,
    200,
    `sessions failed: ${sessionsRes.body}`,
  );
  const sessions = sessionsRes.json() as {
    sessions: Array<{
      userAgent?: string;
      isCurrentSession?: boolean;
    }>;
  };
  assert.ok(Array.isArray(sessions.sessions));
  assert.ok(sessions.sessions.length >= 1);
  const current = sessions.sessions.find((s) => s.isCurrentSession);
  assert.ok(current?.userAgent?.includes('Chrome'), 'session should store UA');

  const changePasswordRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/change-password',
    headers: {
      cookie: jar.header,
      'x-csrf-token': jar.csrf,
      'content-type': 'application/json',
    },
    payload: { currentPassword: password, newPassword: 'password456' },
  });
  assert.equal(
    changePasswordRes.statusCode,
    200,
    `change-password failed: ${changePasswordRes.body}`,
  );

  const loginOldPassword = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username, password },
  });
  assert.equal(
    loginOldPassword.statusCode,
    401,
    'old password should no longer work',
  );

  const loginNewPassword = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username, password: 'password456' },
  });
  assert.equal(
    loginNewPassword.statusCode,
    200,
    `new password login failed: ${loginNewPassword.body}`,
  );
  const loginBody = loginNewPassword.json() as {
    mfaRequired?: boolean;
    user?: { id: string };
  };
  assert.ok(!loginBody.mfaRequired, 'memory/mock login should not require MFA');
  assert.ok(loginBody.user?.id);
  const loginByEmail = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: email, password: 'password456' },
  });
  assert.equal(
    loginByEmail.statusCode,
    200,
    `email login failed: ${loginByEmail.body}`,
  );
  const loginEmailJar = jarFromSetCookie(
    loginByEmail.headers['set-cookie'],
    CSRF_COOKIE,
  );
  const sid = cookieValue(loginEmailJar.header, SESSION_COOKIE);
  assert.ok(sid, 'session cookie should be present after login');
  const sess = await serverSession.getServerSession(sid);
  assert.ok(sess?.refreshTokenId, 'session should be bound to refresh token');
  const { store } = await getAuthStore();
  await store.revokeRefreshToken(sess!.refreshTokenId);
  await serverSession.markServerSessionRefreshValidated(sid, 0);
  const meAfterRefreshRevoked = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { cookie: loginEmailJar.header },
  });
  assert.equal(
    meAfterRefreshRevoked.statusCode,
    401,
    'session auth must fail after bound refresh token is revoked',
  );
  const reloginAfterRevocation = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: email, password: 'password456' },
  });
  assert.equal(
    reloginAfterRevocation.statusCode,
    200,
    `relogin after session invalidation failed: ${reloginAfterRevocation.body}`,
  );
  jar = jarFromSetCookie(
    reloginAfterRevocation.headers['set-cookie'],
    CSRF_COOKIE,
  );
  const cookieBeforeLogout = jar.header;

  const logoutRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/logout',
    headers: {
      cookie: jar.header,
      'x-csrf-token': jar.csrf,
      'content-type': 'application/json',
    },
    payload: {},
  });
  assert.equal(logoutRes.statusCode, 200, `logout failed: ${logoutRes.body}`);

  const refreshAfterLogout = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    headers: { cookie: cookieBeforeLogout, 'content-type': 'application/json' },
    payload: {},
  });
  assert.equal(
    refreshAfterLogout.statusCode,
    401,
    'refresh should fail after logout',
  );

  const guestMint = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/guest',
    payload: {},
  });
  assert.ok(
    guestMint.statusCode === 200 || guestMint.statusCode === 201,
    `guest mint: ${guestMint.body}`,
  );
  const mintBody = guestMint.json() as {
    user: {
      id: string;
      isGuest?: boolean;
      displayName?: string;
      username?: string;
    };
  };
  assert.equal(mintBody.user?.isGuest, true);
  assert.ok(
    mintBody.user.displayName?.trim().includes(' '),
    'guest should receive a two-word display alias',
  );
  assert.match(mintBody.user.username ?? '', /^guest_/);
  let guestJar = jarFromSetCookie(guestMint.headers['set-cookie'], CSRF_COOKIE);
  assert.match(guestJar.header, /echo_guest_uid=/);

  const forgedGuestCookieResume = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/guest',
    payload: {},
    headers: { cookie: `echo_guest_uid=${mintBody.user.id}` },
  });
  assert.equal(
    forgedGuestCookieResume.statusCode,
    201,
    `forged guest resume should mint instead: ${forgedGuestCookieResume.body}`,
  );
  const forgedGuestBody = forgedGuestCookieResume.json() as {
    resumed?: boolean;
    user: { id: string };
  };
  assert.notEqual(
    forgedGuestBody.user.id,
    mintBody.user.id,
    'raw guest id cookie must not resume another guest account',
  );
  assert.notEqual(
    forgedGuestBody.resumed,
    true,
    'forged raw guest cookie must not report resumed=true',
  );

  const guestResume = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/guest',
    payload: {},
    headers: { cookie: guestJar.header },
  });
  assert.equal(
    guestResume.statusCode,
    200,
    `guest resume: ${guestResume.body}`,
  );
  const resumeBody = guestResume.json() as {
    resumed?: boolean;
    user: { id: string };
  };
  assert.equal(resumeBody.resumed, true);
  assert.equal(resumeBody.user.id, mintBody.user.id);
  guestJar = jarMergeSetCookie(
    guestJar,
    guestResume.headers['set-cookie'],
    CSRF_COOKIE,
  );

  const guestEmail = `guest_up_${Date.now()}@echo.test`;
  const guestUsername = `guest_saved_${Date.now().toString(36)}`;
  const guestUpgrade = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/guest/upgrade',
    headers: {
      cookie: guestJar.header,
      'x-csrf-token': guestJar.csrf,
      'content-type': 'application/json',
    },
    payload: {
      email: guestEmail,
      password: 'password123',
      username: guestUsername,
      displayName: 'Upgraded Guest',
    },
  });
  assert.equal(
    guestUpgrade.statusCode,
    200,
    `guest upgrade: ${guestUpgrade.body}`,
  );
  const upUser = (
    guestUpgrade.json() as {
      user: { isGuest?: boolean; id: string; username: string };
    }
  ).user;
  assert.equal(upUser.isGuest, false);
  assert.equal(upUser.id, mintBody.user.id);
  assert.equal(upUser.username, guestUsername);

  const guestLoginByUsername = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: guestUsername, password: 'password123' },
  });
  assert.equal(
    guestLoginByUsername.statusCode,
    200,
    `guest username login failed: ${guestLoginByUsername.body}`,
  );

  const guestLoginByEmail = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: guestEmail, password: 'password123' },
  });
  assert.equal(
    guestLoginByEmail.statusCode,
    200,
    `guest email login failed: ${guestLoginByEmail.body}`,
  );

  await app.close();
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Auth integration tests passed');
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Auth integration tests failed', err);
    process.exit(1);
  });
