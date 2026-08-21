import assert from 'node:assert/strict';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';
import { attachGameSocketServer } from '../realtime/socket';
import { gameServerConfig } from '../config';
import { GAME_C2S, GAME_S2C, type GameSnapshotMsg } from '../../cores/games';
import {
  buildSoloCodenamesRoles,
  CODENAMES_ACTION,
  type CodenamesView,
} from '../../cores/games/codenames';

const ROOM = 'room-codenames-test';

function mintToken(sub: string): string {
  return jwt.sign(
    { sub, username: sub, roomId: ROOM, gameKey: 'codenames' },
    gameServerConfig.gameTokenSecret,
    { algorithm: 'HS256', expiresIn: 60 },
  );
}

async function startServer(): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const app = Fastify({ logger: false });
  attachGameSocketServer(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { port, close: () => app.close() };
}

function open(port: number, token: string) {
  const socket = ioClient(`http://127.0.0.1:${port}`, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  const seen: CodenamesView[] = [];
  type Waiter = {
    pred: (v: CodenamesView) => boolean;
    resolve: (v: CodenamesView) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  const waiters: Waiter[] = [];
  socket.on(GAME_S2C.snapshot, (msg: GameSnapshotMsg) => {
    const v = msg.view as CodenamesView;
    seen.push(v);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i]!.pred(v)) {
        clearTimeout(waiters[i]!.timer);
        waiters[i]!.resolve(v);
        waiters.splice(i, 1);
      }
    }
  });
  return {
    socket,
    waitFor(pred: (v: CodenamesView) => boolean, timeoutMs = 3000) {
      const hit = [...seen].reverse().find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise<CodenamesView>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('snapshot timeout')),
          timeoutMs,
        );
        waiters.push({ pred, resolve, timer });
      });
    },
  };
}

export async function runCodenamesSocketTests(): Promise<void> {
  const server = await startServer();
  const trackers: ReturnType<typeof open>[] = [];
  try {
    const host = open(server.port, mintToken('solo'));
    trackers.push(host);
    await host.waitFor((v) => v.phase === 'lobby' && v.youAreOrchestrator);

    const roles = buildSoloCodenamesRoles('solo');
    host.socket.emit(GAME_C2S.action, {
      roomId: ROOM,
      type: CODENAMES_ACTION.setup,
      payload: { roleAssignments: roles },
    });
    await host.waitFor((v) => v.roleAssignments.length === 1);

    host.socket.emit(GAME_C2S.action, {
      roomId: ROOM,
      type: CODENAMES_ACTION.deal,
    });
    const playing = await host.waitFor(
      (v) => v.phase === 'playing' && !!v.spymasterKey?.length,
    );
    assert.equal(playing.spymasterKey?.length, 25);
    assert.equal(playing.cells.filter((c) => c.revealed).length, 0);

    host.socket.emit(GAME_C2S.action, {
      roomId: ROOM,
      type: CODENAMES_ACTION.clue,
      payload: { word: 'HINT', number: 1 },
    });
    await host.waitFor((v) => v.turnStage === 'await_guess');

    console.log('✓ codenames.socket: solo setup, deal, clue');
  } finally {
    for (const t of trackers) t.socket.disconnect();
    await server.close();
  }
}
