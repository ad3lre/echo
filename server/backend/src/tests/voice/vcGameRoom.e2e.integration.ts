/**
 * E2E: Echo backend mints game join tokens; browser clients connect to echo-game-server.
 * Requires Postgres (DATABASE_URL) and a running game-server on GAME_SERVER_PUBLIC_URL
 * (default http://127.0.0.1:3060).
 *
 * Run: npm run test:vc-game-room:e2e -w backend
 */
import assert from 'node:assert/strict';
import { io as ioClient, type Socket } from 'socket.io-client';
import { getEchoStore } from '../../domain/echoStore';
import { buildEchoTestApp } from '../helpers/echoTestApp';
import {
  GAME_S2C,
  type GameSnapshotMsg,
} from '../../../../activities/cores/games';

const GAME_KEYS = ['hangman', 'skriggles', 'codenames', 'tic_tac_toe'] as const;

async function waitForGameSnapshot(
  socket: Socket,
  roomId: string,
  timeoutMs = 8000,
): Promise<GameSnapshotMsg<unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('game snapshot timeout')),
      timeoutMs,
    );
    socket.on(GAME_S2C.snapshot, (msg: GameSnapshotMsg<unknown>) => {
      if (!msg || msg.roomId !== roomId) return;
      clearTimeout(timer);
      resolve(msg);
    });
    socket.on('connect_error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function waitForSocketConnect(socket: Socket): Promise<void> {
  if (socket.connected) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('socket connect timeout')),
      8000,
    );
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function assertGameServerReachable(url: string): Promise<void> {
  const healthUrl = `${url.replace(/\/$/, '')}/health`;
  const res = await fetch(healthUrl);
  assert.equal(res.status, 200, `game-server health ${healthUrl}`);
  const body = (await res.json()) as { ok?: boolean };
  assert.equal(body.ok, true, 'game-server health body');
}

async function run(): Promise<void> {
  let enabled = false;
  let pool: Awaited<ReturnType<typeof getEchoStore>>['pool'] = null;
  try {
    const s = await getEchoStore();
    enabled = s.enabled;
    pool = s.pool;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      /Postgres is unavailable|pool is unavailable|Check DATABASE_URL/i.test(
        msg,
      )
    ) {
      console.log('vcGameRoom.e2e: skip (Echo store unavailable)', msg);
      return;
    }
    throw e;
  }
  if (!enabled || !pool) {
    console.log('vcGameRoom.e2e: skip (no DATABASE_URL / Echo disabled)');
    return;
  }

  const { baseUrl, close } = await buildEchoTestApp();
  const username = `vc_game_${Date.now().toString(36)}`;

  try {
    const reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password: 'password123',
        email: `${username}@echo.test`,
        displayName: 'VC Game E2E',
      }),
    });
    const regBody = await reg.text();
    assert.equal(reg.status, 201, regBody);
    const auth = JSON.parse(regBody) as { csrfToken: string };
    const sid = reg.headers
      .get('set-cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('echo_sid='))
      ?.split('=')[1];
    assert.ok(sid, 'echo_sid cookie');

    const srv = await fetch(`${baseUrl}/api/v1/echo/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': auth.csrfToken,
        cookie: `echo_sid=${sid}`,
      },
      body: JSON.stringify({ name: 'VC Game E2E Server' }),
    });
    const srvBody = await srv.text();
    assert.equal(srv.status, 201, srvBody);
    const { serverId } = JSON.parse(srvBody) as { serverId: string };

    const chList = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels`,
      { headers: { cookie: `echo_sid=${sid}` } },
    );
    const chListBody = await chList.text();
    assert.equal(chList.status, 200, chListBody);
    const channels = (
      JSON.parse(chListBody) as {
        channels: {
          id: string;
          type: string;
          name: string;
          categoryId: string;
        }[];
      }
    ).channels;
    const voiceCategoryId = channels.find(
      (c) => c.type === 'voice',
    )?.categoryId;
    assert.ok(voiceCategoryId, 'voice category');

    async function createVoiceChannel(name: string): Promise<string> {
      const cr = await fetch(
        `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': auth.csrfToken,
            cookie: `echo_sid=${sid}`,
          },
          body: JSON.stringify({
            name,
            type: 'voice',
            categoryId: voiceCategoryId,
          }),
        },
      );
      const crBody = await cr.text();
      assert.equal(cr.status, 201, crBody);
      return (JSON.parse(crBody) as { channelId: string }).channelId;
    }

    for (const gameKey of GAME_KEYS) {
      const voiceChannelId = await createVoiceChannel(`vc-${gameKey}`);
      const mint = await fetch(
        `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(voiceChannelId)}/voice/game-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': auth.csrfToken,
            cookie: `echo_sid=${sid}`,
          },
          body: JSON.stringify({ gameKey }),
        },
      );
      const mintBody = await mint.text();
      assert.equal(mint.status, 200, `${gameKey} mint: ${mintBody}`);
      const {
        url,
        token,
        roomId,
        gameKey: mintedKey,
      } = JSON.parse(mintBody) as {
        url: string;
        token: string;
        roomId: string;
        gameKey: string;
      };
      assert.equal(mintedKey, gameKey);
      assert.equal(roomId, voiceChannelId);
      assert.ok(url?.trim(), 'minted url');
      assert.ok(token?.trim(), 'minted token');

      await assertGameServerReachable(url);

      const socket = ioClient(url, {
        auth: { token },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        autoConnect: false,
      });
      try {
        const snapshotPromise = waitForGameSnapshot(socket, roomId);
        socket.connect();
        await waitForSocketConnect(socket);
        const snapshot = await snapshotPromise;
        assert.equal(snapshot.roomId, roomId);
        assert.ok(snapshot.view != null, `${gameKey} snapshot view`);
        assert.ok(
          typeof snapshot.rev === 'number' && snapshot.rev >= 0,
          `${gameKey} snapshot rev`,
        );
        console.log(`vcGameRoom.e2e: ok ${gameKey} rev=${snapshot.rev}`);
      } finally {
        socket.disconnect();
      }
    }

    console.log('vcGameRoom.e2e: all authoritative games connected');
  } finally {
    await close();
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('vcGameRoom.e2e: FAIL', err);
    process.exit(1);
  });
