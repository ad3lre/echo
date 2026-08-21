/**
 * E2E: authoritative VC hangman through the Echo socket tunnel
 * (game:join / game:action / game:leave — no direct game-server browser socket).
 *
 * Spins up an inline game-server with relay pointed at the test Echo app so
 * multi-player snapshot fan-out works without a preconfigured ECHO_GAME_RELAY_BASE_URL.
 *
 * Requires Postgres (DATABASE_URL).
 *
 * Run: npm run test:vc-game-room:tunnel:e2e -w backend
 */
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {
  io as ioClient,
  type Socket as IoClientSocket,
} from 'socket.io-client';
import { attachGameSocketServer } from '../../../../activities/src/realtime/socket';
import { gameServerConfig } from '../../../../activities/src/config';
import { config as backendConfig } from '../../config';
import { signEchoWebhookBody } from '../../../../../contracts/echoWebhookHmac';
import { getEchoStore, joinEchoVoiceChannel } from '../../domain/echoStore';
import { buildEchoTestApp } from '../helpers/echoTestApp';
import {
  GAME_C2S,
  GAME_S2C,
  type GameSnapshotMsg,
} from '../../../../activities/cores/games';
import {
  HANGMAN_ACTION,
  type HangmanView,
} from '../../../../activities/cores/games/hangman';

type AuthUser = {
  userId: string;
  csrfToken: string;
  sid: string;
};

async function startInlineGameServer(
  relayBaseUrl: string,
  forwardSecret: string,
): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  (gameServerConfig as { echoRelayBaseUrl: string }).echoRelayBaseUrl =
    relayBaseUrl.replace(/\/$/, '');
  (gameServerConfig as { echoForwardSecret: string }).echoForwardSecret =
    forwardSecret;
  const app = Fastify({ logger: false });
  attachGameSocketServer(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  assert.ok(port, 'game-server port');
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => app.close(),
  };
}

async function registerUser(
  baseUrl: string,
  username: string,
): Promise<AuthUser> {
  const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: 'password123',
      email: `${username}@echo.test`,
      displayName: username,
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
  assert.ok(sid, 'echo_sid cookie');
  return { userId: parsed.user.id, csrfToken: parsed.csrfToken, sid };
}

async function connectEchoSocket(
  baseUrl: string,
  sid: string,
): Promise<IoClientSocket> {
  const socket = ioClient(baseUrl, {
    transports: ['polling', 'websocket'],
    extraHeaders: { cookie: `echo_sid=${sid}` },
    forceNew: true,
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('echo socket connect timeout')),
      12_000,
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
  return socket;
}

function createHangmanSnapshotTracker(socket: IoClientSocket, roomId: string) {
  const seen: HangmanView[] = [];
  type Waiter = {
    pred: (v: HangmanView) => boolean;
    resolve: (v: HangmanView) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  const waiters: Waiter[] = [];

  const onSnapshot = (msg: GameSnapshotMsg) => {
    if (!msg || msg.roomId !== roomId) return;
    const v = msg.view as HangmanView;
    seen.push(v);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i]!.pred(v)) {
        clearTimeout(waiters[i]!.timer);
        waiters[i]!.resolve(v);
        waiters.splice(i, 1);
      }
    }
  };
  socket.on(GAME_S2C.snapshot, onSnapshot);
  socket.on(GAME_S2C.error, (err) => {
    throw new Error(`game:error ${JSON.stringify(err)}`);
  });

  return {
    join() {
      socket.emit(GAME_C2S.join, { roomId, gameKey: 'hangman' as const });
    },
    action(type: string, payload?: unknown) {
      socket.emit(GAME_C2S.action, { roomId, type, payload });
    },
    waitFor(pred: (v: HangmanView) => boolean, timeoutMs = 12_000) {
      const hit = [...seen].reverse().find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise<HangmanView>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('hangman snapshot timeout')),
          timeoutMs,
        );
        waiters.push({ pred, resolve, timer });
      });
    },
    dispose() {
      socket.off(GAME_S2C.snapshot, onSnapshot);
      socket.emit(GAME_C2S.leave, { roomId });
    },
  };
}

/** Sanity-check game-server → backend HMAC relay before the gameplay scenario. */
async function assertOutboundRelayDelivers(opts: {
  baseUrl: string;
  userId: string;
  socket: IoClientSocket;
  roomId: string;
}): Promise<void> {
  const snapshot = {
    roomId: opts.roomId,
    gameKey: 'hangman' as const,
    rev: 999,
    view: {
      roundSeq: 0,
      setterUserId: opts.userId,
      rosterUserIds: [opts.userId],
      phase: 'setter_picking' as const,
      guessedLetters: [],
      guessHistory: [],
      wrongCount: 0,
      mask: null,
      roundResult: null,
      answerReveal: null,
      youAreSetter: true,
    },
  };
  const rawBody = JSON.stringify({ userId: opts.userId, snapshot });
  const signed = signEchoWebhookBody(
    backendConfig.gameServerForwardSecret,
    rawBody,
  );
  const got = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('outbound relay probe timeout')),
      5000,
    );
    const onSnap = (msg: GameSnapshotMsg) => {
      if (msg?.rev !== 999) return;
      clearTimeout(timer);
      opts.socket.off(GAME_S2C.snapshot, onSnap);
      resolve();
    };
    opts.socket.on(GAME_S2C.snapshot, onSnap);
  });
  const res = await fetch(`${opts.baseUrl}/api/v1/internal/game/outbound`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-echo-signature-ts': signed['x-echo-signature-ts'],
      'x-echo-signature': signed['x-echo-signature'],
    },
    body: rawBody,
  });
  assert.equal(res.status, 200, await res.text());
  await got;
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
      console.log('vcGameRoomTunnel.e2e: skip (Echo store unavailable)', msg);
      return;
    }
    throw e;
  }
  if (!enabled || !pool) {
    console.log('vcGameRoomTunnel.e2e: skip (no DATABASE_URL / Echo disabled)');
    return;
  }

  const { baseUrl, close: closeEcho } = await buildEchoTestApp();
  const gameServer = await startInlineGameServer(
    baseUrl,
    backendConfig.gameServerForwardSecret,
  );
  (backendConfig as { gameServerInternalUrl: string }).gameServerInternalUrl =
    gameServer.url;
  (backendConfig as { gameServerEnabled: boolean }).gameServerEnabled = true;

  const stamp = Date.now().toString(36);
  let setterSocket: IoClientSocket | null = null;
  let guesserSocket: IoClientSocket | null = null;

  try {
    const setter = await registerUser(baseUrl, `hm_set_${stamp}`);
    const guesser = await registerUser(baseUrl, `hm_gue_${stamp}`);

    const srv = await fetch(`${baseUrl}/api/v1/echo/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': setter.csrfToken,
        cookie: `echo_sid=${setter.sid}`,
      },
      body: JSON.stringify({ name: 'Hangman Tunnel E2E' }),
    });
    const srvBody = await srv.text();
    assert.equal(srv.status, 201, srvBody);
    const { serverId } = JSON.parse(srvBody) as { serverId: string };

    const vanity = `hm${stamp}`;
    const setVanity = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/preferences`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': setter.csrfToken,
          cookie: `echo_sid=${setter.sid}`,
        },
        body: JSON.stringify({ vanityCode: vanity }),
      },
    );
    assert.equal(setVanity.status, 204, await setVanity.clone().text());

    const inviteRes = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/invites`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': setter.csrfToken,
          cookie: `echo_sid=${setter.sid}`,
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(inviteRes.status, 201, await inviteRes.clone().text());
    const inviteJson = (await inviteRes.json()) as {
      vanityCode?: string;
      code?: string;
    };
    const code = inviteJson.vanityCode ?? inviteJson.code ?? vanity;
    const joinInvite = await fetch(
      `${baseUrl}/api/v1/echo/invites/${encodeURIComponent(code)}/join`,
      {
        method: 'POST',
        headers: {
          'x-csrf-token': guesser.csrfToken,
          cookie: `echo_sid=${guesser.sid}`,
        },
      },
    );
    assert.ok(
      joinInvite.status === 204 || joinInvite.status === 200,
      await joinInvite.clone().text(),
    );

    const chList = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels`,
      { headers: { cookie: `echo_sid=${setter.sid}` } },
    );
    const channels = (
      JSON.parse(await chList.text()) as {
        channels: { id: string; type: string; categoryId: string }[];
      }
    ).channels;
    const voiceCategoryId = channels.find(
      (c) => c.type === 'voice',
    )?.categoryId;
    assert.ok(voiceCategoryId, 'voice category');

    const chCreate = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': setter.csrfToken,
          cookie: `echo_sid=${setter.sid}`,
        },
        body: JSON.stringify({
          name: 'hangman-vc',
          type: 'voice',
          categoryId: voiceCategoryId,
        }),
      },
    );
    assert.equal(chCreate.status, 201, await chCreate.clone().text());
    const { channelId: voiceChannelId } = (await chCreate.json()) as {
      channelId: string;
    };

    const j1 = await joinEchoVoiceChannel(
      pool,
      serverId,
      voiceChannelId,
      setter.userId,
      { membershipAlreadyVerified: true },
    );
    assert.equal(j1.ok, true, 'setter voice join');
    const j2 = await joinEchoVoiceChannel(
      pool,
      serverId,
      voiceChannelId,
      guesser.userId,
      { membershipAlreadyVerified: true },
    );
    assert.equal(j2.ok, true, 'guesser voice join');

    setterSocket = await connectEchoSocket(baseUrl, setter.sid);
    guesserSocket = await connectEchoSocket(baseUrl, guesser.sid);

    await assertOutboundRelayDelivers({
      baseUrl,
      userId: guesser.userId,
      socket: guesserSocket,
      roomId: 'probe-room',
    });

    const setterGame = createHangmanSnapshotTracker(
      setterSocket,
      voiceChannelId,
    );
    const guesserGame = createHangmanSnapshotTracker(
      guesserSocket,
      voiceChannelId,
    );

    setterGame.join();
    await setterGame.waitFor(
      (v) => v.youAreSetter && v.phase === 'setter_picking',
    );

    guesserGame.join();
    await guesserGame.waitFor((v) => v.rosterUserIds.length === 2);

    setterGame.action(HANGMAN_ACTION.commitWord, { word: 'ECHO' });
    await Promise.all([
      setterGame.waitFor((v) => v.phase === 'guessing' && v.mask === '____'),
      guesserGame.waitFor((v) => v.phase === 'guessing' && v.mask === '____'),
    ]);

    for (const letter of ['E', 'C', 'H', 'O'] as const) {
      guesserGame.action(HANGMAN_ACTION.guessLetter, { letter });
    }

    await Promise.all([
      setterGame.waitFor(
        (v) => v.phase === 'round_over' && v.roundResult === 'won',
      ),
      guesserGame.waitFor(
        (v) => v.phase === 'round_over' && v.roundResult === 'won',
      ),
    ]);

    guesserGame.action(HANGMAN_ACTION.nextRound, { completedRoundSeq: 0 });
    await setterGame.waitFor(
      (v) => v.roundSeq === 1 && v.phase === 'setter_picking',
    );

    setterGame.dispose();
    guesserGame.dispose();

    console.log(
      'vcGameRoomTunnel.e2e: ok hangman completed via Echo socket tunnel',
    );
  } finally {
    setterSocket?.disconnect();
    guesserSocket?.disconnect();
    await closeEcho();
    await gameServer.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('vcGameRoomTunnel.e2e: FAIL', err);
    process.exit(1);
  });
