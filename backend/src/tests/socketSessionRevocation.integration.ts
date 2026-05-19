import assert from 'node:assert/strict';
import {
  io as ioClient,
  type Socket as IoClientSocket,
} from 'socket.io-client';
import { buildEchoTestApp } from './helpers/echoTestApp';

type CookieJar = {
  header: string;
  csrf: string;
};

function jarFromSetCookie(
  setCookie: string[] | null,
  csrfCookieName: string,
): CookieJar {
  const pairs: string[] = [];
  let csrf = '';
  for (const line of setCookie ?? []) {
    const seg = line.split(';')[0]?.trim();
    if (!seg) continue;
    pairs.push(seg);
    if (seg.startsWith(`${csrfCookieName}=`)) {
      csrf = decodeURIComponent(seg.slice(`${csrfCookieName}=`.length));
    }
  }
  return { header: pairs.join('; '), csrf };
}

async function registerUser(
  baseUrl: string,
  username: string,
): Promise<{
  jar: CookieJar;
}> {
  const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: 'password123',
      email: `${username}@echo.test`,
      displayName: 'Socket Test User',
    }),
  });
  const body = await res.text();
  assert.equal(res.status, 201, body);
  return {
    jar: jarFromSetCookie(res.headers.getSetCookie(), 'echo_csrf'),
  };
}

async function connectSocket(
  baseUrl: string,
  cookieHeader: string,
): Promise<IoClientSocket> {
  const socket: IoClientSocket = ioClient(baseUrl, {
    transports: ['polling', 'websocket'],
    extraHeaders: { cookie: cookieHeader },
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('socket connect timeout')),
      8000,
    );
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  return socket;
}

async function run(): Promise<void> {
  process.env.NODE_ENV = 'development';
  process.env.ECHO_BACKEND_STORAGE = 'memory';
  process.env.DATABASE_URL = '';
  process.env.USE_MOCK_DB = '';
  process.env.ECHO_AUTH_STORE = '';
  process.env.REDIS_URL = '';

  const { baseUrl, close } = await buildEchoTestApp();
  const username = `sock_auth_${Date.now().toString(36)}`;

  let socket: IoClientSocket | null = null;
  try {
    const { jar } = await registerUser(baseUrl, username);
    socket = await connectSocket(baseUrl, jar.header);
    assert.equal(socket.connected, true, 'socket should authenticate');

    const disconnect = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('socket disconnect timeout after logout')),
        8000,
      );
      socket!.once('disconnect', (reason) => {
        clearTimeout(timer);
        resolve(reason);
      });
    });

    const logoutRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        cookie: jar.header,
        'x-csrf-token': jar.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const logoutBody = await logoutRes.text();
    assert.equal(logoutRes.status, 200, logoutBody);

    const reason = await disconnect;
    assert.equal(
      reason,
      'io server disconnect',
      'logout should sever the authenticated realtime socket',
    );
  } finally {
    socket?.disconnect();
    await close();
  }
}

run()
  .then(() => {
    process.stdout.write('socketSessionRevocation.integration.ts passed\n');
  })
  .catch((e) => {
    process.stderr.write(
      `socketSessionRevocation.integration.ts failed: ${String(e)}\n`,
    );
    process.exit(1);
  });
