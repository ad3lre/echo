#!/usr/bin/env node
/**
 * Native Apple-client contract e2e against a running Echo API (Postgres required).
 *
 * Covers the same REST + Socket.IO path the Swift client uses:
 * X-Echo-Client: ios bearer mint, friends + DM open, presence client=mobile,
 * live message / dm:activity, poll vote, after= catch-up, and token refresh.
 *
 * Usage (backend already healthy on :3000):
 *   npm run apple:e2e
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const API = (process.env.ECHO_APPLE_E2E_API ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
);
const CLIENT = 'ios';
const HEALTH_TIMEOUT_MS = 90_000;
const EVENT_TIMEOUT_MS = 12_000;
const SOCKET_CONNECT_TIMEOUT_MS = 15_000;
const USER_A = {
  username: 'applee2ea',
  password: 'AppleE2e-dev-1',
  email: 'applee2ea@localhost.invalid',
};
const USER_B = {
  username: 'applee2eb',
  password: 'AppleE2e-dev-1',
  email: 'applee2eb@localhost.invalid',
};

function nativeHeaders(token) {
  return {
    'content-type': 'application/json',
    accept: 'application/json',
    'x-echo-client': CLIENT,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function request(pathname, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: nativeHeaders(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json, text };
}

function pass(name) {
  process.stderr.write(`ok  ${name}\n`);
}

function fail(name, detail) {
  throw new Error(`${name}: ${detail}`);
}

function assert(name, condition, detail) {
  if (!condition) fail(name, detail ?? 'failed');
  pass(name);
}

async function waitForHealth() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let last = 'not contacted';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API}/api/v1/health`);
      last = `${res.status}`;
      if (res.ok) {
        pass('api health');
        return;
      }
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  fail('api health', `timed out (${last})`);
}

async function registerOrLogin(account) {
  const login = await request('/api/v1/auth/login', {
    method: 'POST',
    body: { username: account.username, password: account.password },
  });
  if (login.status === 200 && login.json?.auth?.accessToken) {
    return { user: login.json.user, auth: login.json.auth };
  }
  const registered = await request('/api/v1/auth/register', {
    method: 'POST',
    body: {
      username: account.username,
      password: account.password,
      email: account.email,
      displayName: account.username,
      clientHwid: `apple-e2e-${account.username}-device-id`,
    },
  });
  if (!(registered.status >= 200 && registered.status < 300)) {
    fail(
      `register ${account.username}`,
      `${registered.status} ${registered.text.slice(0, 240)}`,
    );
  }
  if (!registered.json?.auth?.accessToken) {
    fail(
      `register ${account.username}`,
      'native auth tokens missing (send X-Echo-Client: ios)',
    );
  }
  return { user: registered.json.user, auth: registered.json.auth };
}

function connectSocket(accessToken) {
  return new Promise((resolve, reject) => {
    const socket = io(API, {
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      timeout: SOCKET_CONNECT_TIMEOUT_MS,
      auth: { token: accessToken },
      extraHeaders: {
        Authorization: `Bearer ${accessToken}`,
        'X-Echo-Client': CLIENT,
      },
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('socket connect timed out'));
    }, SOCKET_CONNECT_TIMEOUT_MS);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });
  });
}

function waitEvent(socket, name, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, onEvent);
      reject(new Error(`timed out waiting for ${name}`));
    }, EVENT_TIMEOUT_MS);
    function onEvent(payload) {
      if (predicate && !predicate(payload)) return;
      clearTimeout(timer);
      socket.off(name, onEvent);
      resolve(payload);
    }
    socket.on(name, onEvent);
  });
}

async function sendMessage(token, channelId, content, poll) {
  const body = { content, id: randomUUID() };
  if (poll) body.poll = poll;
  const res = await request(
    `/api/v1/echo/channels/${encodeURIComponent(channelId)}/messages`,
    { method: 'POST', token, body },
  );
  if (res.status < 200 || res.status >= 300) {
    fail('send message', `${res.status} ${res.text.slice(0, 240)}`);
  }
  return res.json.message;
}

async function main() {
  await waitForHealth();

  const a = await registerOrLogin(USER_A);
  const b = await registerOrLogin(USER_B);
  assert(
    'native bearer mint',
    typeof a.auth.accessToken === 'string' &&
      typeof a.auth.refreshToken === 'string' &&
      Number.isFinite(a.auth.expiresInSec),
    'login/register must return auth.{accessToken,refreshToken,expiresInSec}',
  );

  const requestRes = await request('/api/v1/echo/friends/request', {
    method: 'POST',
    token: a.auth.accessToken,
    body: { peerId: b.user.id },
  });
  assert(
    'friend request',
    requestRes.status === 204 || requestRes.status === 409,
    `${requestRes.status} ${requestRes.text.slice(0, 160)}`,
  );
  const acceptRes = await request('/api/v1/echo/friends/accept', {
    method: 'POST',
    token: b.auth.accessToken,
    body: { peerId: a.user.id },
  });
  assert(
    'friend accept',
    acceptRes.status === 204 || acceptRes.status === 404,
    `${acceptRes.status} ${acceptRes.text.slice(0, 160)}`,
  );

  const openRes = await request('/api/v1/echo/dm/open', {
    method: 'POST',
    token: a.auth.accessToken,
    body: { peerUserId: b.user.id },
  });
  const channelId = openRes.json?.channelId ?? openRes.json?.thread?.channelId;
  assert(
    'open DM',
    openRes.status >= 200 && openRes.status < 300 && channelId,
    `${openRes.status} ${openRes.text.slice(0, 240)}`,
  );

  const presenceRes = await request('/api/v1/echo/presence', {
    method: 'POST',
    token: a.auth.accessToken,
    body: { status: 'online', client: 'mobile' },
  });
  assert(
    'presence client=mobile',
    presenceRes.status === 204,
    `${presenceRes.status} ${presenceRes.text.slice(0, 160)}`,
  );

  const socketA = await connectSocket(a.auth.accessToken);
  const socketB = await connectSocket(b.auth.accessToken);
  pass('socket handshake with native token');
  socketA.emit('joinChannel', channelId);
  socketB.emit('joinChannel', channelId);

  const liveMessage = waitEvent(
    socketA,
    'message',
    (payload) => payload?.channelId === channelId || payload?.id,
  );
  const liveActivity = waitEvent(
    socketA,
    'dm:activity',
    (payload) => payload?.thread?.channelId === channelId,
  );
  const first = await sendMessage(
    b.auth.accessToken,
    channelId,
    'apple e2e live ping',
  );
  const messageEvent = await liveMessage;
  const activityEvent = await liveActivity;
  assert(
    'live message event',
    (messageEvent.id ?? messageEvent?.message?.id) === first.id ||
      messageEvent.channelId === channelId,
    JSON.stringify(messageEvent).slice(0, 200),
  );
  assert(
    'live dm:activity',
    activityEvent.thread?.channelId === channelId &&
      (activityEvent.message?.id === first.id ||
        activityEvent.message?.content),
    JSON.stringify(activityEvent).slice(0, 200),
  );

  const optionYes = randomUUID();
  const optionNo = randomUUID();
  const pollUpdated = waitEvent(
    socketA,
    'poll:updated',
    (payload) => payload?.channelId === channelId,
  );
  const pollMessage = await sendMessage(b.auth.accessToken, channelId, '', {
    question: 'Apple e2e poll?',
    options: [
      { id: optionYes, text: 'Yes' },
      { id: optionNo, text: 'No' },
    ],
    anonymous: false,
  });
  const voteRes = await request(
    `/api/v1/echo/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(pollMessage.id)}/poll/vote`,
    {
      method: 'POST',
      token: a.auth.accessToken,
      body: { optionId: optionYes },
    },
  );
  assert(
    'poll vote',
    voteRes.status >= 200 && voteRes.status < 300 && voteRes.json?.poll,
    `${voteRes.status} ${voteRes.text.slice(0, 240)}`,
  );
  const pollEvent = await pollUpdated;
  assert(
    'poll:updated',
    pollEvent.messageId === pollMessage.id || pollEvent.poll,
    JSON.stringify(pollEvent).slice(0, 200),
  );

  socketA.disconnect();
  const missed = await sendMessage(
    b.auth.accessToken,
    channelId,
    'apple e2e catch-up ping',
  );
  const catchUp = await request(
    `/api/v1/echo/channels/${encodeURIComponent(channelId)}/messages?after=${encodeURIComponent(first.id)}&limit=50`,
    { token: a.auth.accessToken },
  );
  const catchUpIds = (catchUp.json?.messages ?? []).map(
    (row) => row.id ?? row.message?.id,
  );
  assert(
    'after= catch-up',
    catchUp.status === 200 && catchUpIds.includes(missed.id),
    `${catchUp.status} ids=${catchUpIds.join(',')}`,
  );

  const refresh = await request('/api/v1/auth/refresh', {
    method: 'POST',
    body: { refreshToken: a.auth.refreshToken },
  });
  assert(
    'native refresh',
    refresh.status === 200 && refresh.json?.auth?.accessToken,
    `${refresh.status} ${refresh.text.slice(0, 240)}`,
  );

  const invalid = io(API, {
    path: '/socket.io/',
    transports: ['polling', 'websocket'],
    timeout: 5_000,
    auth: { token: 'not-a-session' },
    extraHeaders: { Authorization: 'Bearer not-a-session' },
  });
  const rejected = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      invalid.close();
      resolve(false);
    }, 5_000);
    invalid.once('connect_error', () => {
      clearTimeout(timer);
      invalid.close();
      resolve(true);
    });
    invalid.once('connect', () => {
      clearTimeout(timer);
      invalid.close();
      resolve(false);
    });
  });
  assert('invalid socket token rejected', rejected, 'handshake should fail');

  socketB.disconnect();

  const credentialsPath = path.join(repoRoot, 'clients/apple/.e2e-local.json');
  fs.writeFileSync(
    credentialsPath,
    `${JSON.stringify(
      {
        api: API,
        users: [
          { username: USER_A.username, password: USER_A.password },
          { username: USER_B.username, password: USER_B.password },
        ],
        channelId,
      },
      null,
      2,
    )}\n`,
  );
  process.stderr.write(`wrote ${path.relative(repoRoot, credentialsPath)}\n`);
  process.stderr.write('apple native e2e passed\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
