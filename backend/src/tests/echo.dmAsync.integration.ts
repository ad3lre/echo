import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  io as ioClient,
  type Socket as IoClientSocket,
} from 'socket.io-client';
import { getEchoStore } from '../domain/echoStore';
import { buildEchoTestApp } from './helpers/echoTestApp';

async function waitForEvent<T>(
  socket: IoClientSocket,
  event: string,
  predicate: (payload: T) => boolean,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    const onEvent = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    };
    socket.on(event, onEvent);
  });
}

async function registerUser(
  baseUrl: string,
  username: string,
  displayName: string,
): Promise<{ userId: string; csrfToken: string; sid: string }> {
  const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: 'password123',
      email: `${username}@echo.test`,
      displayName,
    }),
  });
  const body = await res.text();
  assert.equal(res.status, 201, body);
  const parsed = JSON.parse(body) as {
    user: { id: string };
    csrfToken: string;
  };
  const sid =
    res.headers
      .get('set-cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('echo_sid='))
      ?.split('=')[1] ?? '';
  assert.ok(sid, 'session cookie must be set');
  return { userId: parsed.user.id, csrfToken: parsed.csrfToken, sid };
}

async function run(): Promise<void> {
  let enabled = false;
  let pool: Awaited<ReturnType<typeof getEchoStore>>['pool'] = null;
  try {
    const store = await getEchoStore();
    enabled = store.enabled;
    pool = store.pool;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      /Postgres is unavailable|pool is unavailable|Check DATABASE_URL/i.test(
        msg,
      )
    ) {
      console.log(
        'echo.dmAsync.integration: skip (Echo store unavailable)',
        msg,
      );
      return;
    }
    throw e;
  }
  if (!enabled || !pool) {
    console.log(
      'echo.dmAsync.integration: skip (no DATABASE_URL / Echo disabled)',
    );
    return;
  }

  const { baseUrl, close } = await buildEchoTestApp();
  const u1 = `dm_async_u1_${Date.now().toString(36)}`;
  const u2 = `dm_async_u2_${Date.now().toString(36)}`;
  let s1: IoClientSocket | null = null;
  let s2: IoClientSocket | null = null;

  try {
    const user1 = await registerUser(baseUrl, u1, 'Async 1');
    const user2 = await registerUser(baseUrl, u2, 'Async 2');

    const reqRes = await fetch(`${baseUrl}/api/v1/echo/friends/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': user1.csrfToken,
        cookie: `echo_sid=${user1.sid}`,
      },
      body: JSON.stringify({ peerId: user2.userId }),
    });
    assert.equal(reqRes.status, 204, await reqRes.text());

    const acceptRes = await fetch(`${baseUrl}/api/v1/echo/friends/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': user2.csrfToken,
        cookie: `echo_sid=${user2.sid}`,
      },
      body: JSON.stringify({ peerId: user1.userId }),
    });
    assert.equal(acceptRes.status, 204, await acceptRes.text());

    const dmOpenRes = await fetch(`${baseUrl}/api/v1/echo/dm/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': user1.csrfToken,
        cookie: `echo_sid=${user1.sid}`,
      },
      body: JSON.stringify({ peerUserId: user2.userId }),
    });
    const dmOpenBody = await dmOpenRes.text();
    assert.equal(dmOpenRes.status, 200, dmOpenBody);
    const { channelId } = JSON.parse(dmOpenBody) as { channelId: string };
    assert.ok(channelId, 'dm channel id must be returned');

    s1 = ioClient(baseUrl, {
      transports: ['websocket'],
      extraHeaders: { cookie: `echo_sid=${user1.sid}` },
    });
    s2 = ioClient(baseUrl, {
      transports: ['websocket'],
      extraHeaders: { cookie: `echo_sid=${user2.sid}` },
    });
    await Promise.all([
      new Promise<void>((resolve) => s1!.on('connect', () => resolve())),
      new Promise<void>((resolve) => s2!.on('connect', () => resolve())),
    ]);

    const dmActivityPromise = waitForEvent<{
      thread: { channelId: string; kind: string; peerUserId?: string };
      message: { channelId: string; content: string; authorId: string };
    }>(s2, 'dm:activity', (payload) => payload.message.channelId === channelId);
    s1.emit('message', {
      channelId,
      content: 'hello async recipient',
      id: randomUUID(),
    });
    const dmActivity = await dmActivityPromise;
    assert.equal(dmActivity.thread.channelId, channelId);
    assert.equal(dmActivity.thread.kind, 'direct');
    assert.equal(dmActivity.thread.peerUserId, user1.userId);
    assert.equal(dmActivity.message.authorId, user1.userId);
    assert.equal(dmActivity.message.content, 'hello async recipient');

    const incomingCallPromise = waitForEvent<{
      kind: string;
      channelId: string;
      actorUserId: string;
      correlationId?: string;
    }>(s2, 'dm:call', (payload) => payload.kind === 'incoming');
    const inviteCorrelationId = randomUUID();
    s1.emit('dm_call:invite', {
      channelId,
      correlationId: inviteCorrelationId,
    });
    const incomingCall = await incomingCallPromise;
    assert.equal(incomingCall.channelId, channelId);
    assert.equal(incomingCall.actorUserId, user1.userId);
    assert.equal(incomingCall.correlationId, inviteCorrelationId);

    const acceptedCallPromise = waitForEvent<{
      kind: string;
      channelId: string;
      actorUserId: string;
      correlationId?: string;
    }>(s1, 'dm:call', (payload) => payload.kind === 'accepted');
    const acceptCorrelationId = randomUUID();
    s2.emit('dm_call:accept', {
      channelId,
      correlationId: acceptCorrelationId,
    });
    const acceptedCall = await acceptedCallPromise;
    assert.equal(acceptedCall.channelId, channelId);
    assert.equal(acceptedCall.actorUserId, user2.userId);
    assert.equal(acceptedCall.correlationId, acceptCorrelationId);

    const endedCallPromise = waitForEvent<{
      kind: string;
      channelId: string;
      actorUserId: string;
      correlationId?: string;
      reason?: string;
    }>(s1, 'dm:call', (payload) => payload.kind === 'ended');
    const endCorrelationId = randomUUID();
    s2.emit('dm_call:end', {
      channelId,
      correlationId: endCorrelationId,
      reason: 'declined',
    });
    const endedCall = await endedCallPromise;
    assert.equal(endedCall.channelId, channelId);
    assert.equal(endedCall.actorUserId, user2.userId);
    assert.equal(endedCall.correlationId, endCorrelationId);
    assert.equal(endedCall.reason, 'declined');

    console.log('echo.dmAsync.integration: ok');
  } finally {
    s1?.disconnect();
    s2?.disconnect();
    await close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
