import assert from 'node:assert/strict';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { io as ioClient, type Socket } from 'socket.io-client';
import { attachGameSocketServer } from '../realtime/socket';
import { gameServerConfig } from '../config';
import {
  GAME_C2S,
  GAME_S2C,
  type GameErrorMsg,
  type GameSnapshotMsg,
} from '../../cores/games';
import { TTT_ACTION, type TttView } from '../../cores/games/ticTacToe';

const ROOM = 'room-ttt-test';

function mintToken(sub: string): string {
  return jwt.sign(
    { sub, username: sub, roomId: ROOM, gameKey: 'tic_tac_toe' },
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

/**
 * Buffers snapshots from the moment the socket is created so we never miss the
 * initial snapshot the server emits on connection (a listener attached after
 * `connect` resolves would race it).
 */
interface Tracker {
  socket: Socket;
  waitFor(pred: (v: TttView) => boolean, timeoutMs?: number): Promise<TttView>;
  nextError(timeoutMs?: number): Promise<GameErrorMsg>;
}

function open(port: number, token: string): Tracker {
  const socket = ioClient(`http://127.0.0.1:${port}`, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  const seen: TttView[] = [];
  type Waiter = {
    pred: (v: TttView) => boolean;
    resolve: (v: TttView) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  const waiters: Waiter[] = [];
  socket.on(GAME_S2C.snapshot, (msg: GameSnapshotMsg) => {
    const v = msg.view as TttView;
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
    waitFor(pred, timeoutMs = 3000) {
      const hit = [...seen].reverse().find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise<TttView>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('snapshot timeout')),
          timeoutMs,
        );
        waiters.push({ pred, resolve, timer });
      });
    },
    nextError(timeoutMs = 2000) {
      return new Promise<GameErrorMsg>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('expected an error, none received')),
          timeoutMs,
        );
        socket.once(GAME_S2C.error, (msg: GameErrorMsg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });
    },
  };
}

function place(socket: Socket, cell: number): void {
  socket.emit(GAME_C2S.action, {
    roomId: ROOM,
    type: TTT_ACTION.place,
    payload: { cell },
  });
}

function challenge(socket: Socket, toUserId: string): void {
  socket.emit(GAME_C2S.action, {
    roomId: ROOM,
    type: TTT_ACTION.challenge,
    payload: { toUserId },
  });
}

export async function runTicTacToeSocketTests(): Promise<void> {
  const server = await startServer();
  const trackers: Tracker[] = [];
  try {
    const alice = open(server.port, mintToken('alice'));
    trackers.push(alice);
    await alice.waitFor((v) => v.youAre === null && !v.ready);

    const bob = open(server.port, mintToken('bob'));
    trackers.push(bob);
    await bob.waitFor((v) => v.youAre === null && !v.ready);

    challenge(alice.socket, 'bob');
    await bob.waitFor(
      (v) =>
        v.pendingInvite?.fromUserId === 'alice' &&
        v.pendingInvite.toUserId === 'bob',
    );

    bob.socket.emit(GAME_C2S.action, {
      roomId: ROOM,
      type: TTT_ACTION.acceptInvite,
    });
    await Promise.all([
      alice.waitFor((v) => v.youAre === 'X' && v.ready),
      bob.waitFor((v) => v.youAre === 'O' && v.ready && v.currentTurn === 'X'),
    ]);

    const rejected = bob.nextError();
    place(bob.socket, 0);
    assert.equal((await rejected).reason, 'rejected');

    place(alice.socket, 0);
    await alice.waitFor((v) => v.board[0] === 'X' && v.currentTurn === 'O');
    place(bob.socket, 3);
    await bob.waitFor((v) => v.board[3] === 'O' && v.currentTurn === 'X');
    place(alice.socket, 1);
    await alice.waitFor((v) => v.board[1] === 'X' && v.currentTurn === 'O');
    place(bob.socket, 4);
    await bob.waitFor((v) => v.board[4] === 'O' && v.currentTurn === 'X');
    place(alice.socket, 2);
    await Promise.all([
      alice.waitFor((v) => v.status === 'x_wins'),
      bob.waitFor((v) => v.status === 'x_wins'),
    ]);

    const carol = open(server.port, mintToken('carol'));
    trackers.push(carol);
    const carolView = await carol.waitFor(
      (v) => v.status === 'x_wins' && v.board[0] === 'X',
    );
    assert.equal(carolView.youAre, null, 'third player spectates');

    alice.socket.emit(GAME_C2S.action, {
      roomId: ROOM,
      type: TTT_ACTION.rematch,
    });
    await alice.waitFor(
      (v) => v.status === 'playing' && v.board.every((c) => c === ''),
    );

    console.log(
      '✓ ticTacToe.socket: challenge/accept, play, rejection, late-join, rematch',
    );
  } finally {
    for (const t of trackers) t.socket.disconnect();
    await server.close();
  }
}
