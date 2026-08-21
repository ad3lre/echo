import assert from 'node:assert/strict';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { io as ioClient, type Socket } from 'socket.io-client';
import { attachGameSocketServer } from '../realtime/socket';
import { gameServerConfig } from '../config';
import { GAME_C2S, GAME_S2C, type GameSnapshotMsg } from '../../cores/games';
import { HANGMAN_ACTION, type HangmanView } from '../../cores/games/hangman';

const ROOM = 'room-hangman-test';

function mintToken(sub: string): string {
  return jwt.sign(
    { sub, username: sub, roomId: ROOM, gameKey: 'hangman' },
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
  const seen: HangmanView[] = [];
  type Waiter = {
    pred: (v: HangmanView) => boolean;
    resolve: (v: HangmanView) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  const waiters: Waiter[] = [];
  socket.on(GAME_S2C.snapshot, (msg: GameSnapshotMsg) => {
    const v = msg.view as HangmanView;
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
    waitFor(pred: (v: HangmanView) => boolean, timeoutMs = 3000) {
      const hit = [...seen].reverse().find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise<HangmanView>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('snapshot timeout')),
          timeoutMs,
        );
        waiters.push({ pred, resolve, timer });
      });
    },
  };
}

export async function runHangmanSocketTests(): Promise<void> {
  const server = await startServer();
  const trackers: ReturnType<typeof open>[] = [];
  try {
    const setter = open(server.port, mintToken('setter'));
    trackers.push(setter);
    await setter.waitFor((v) => v.youAreSetter && v.phase === 'setter_picking');

    const guesser = open(server.port, mintToken('guesser'));
    trackers.push(guesser);
    await guesser.waitFor((v) => v.rosterUserIds.length === 2);

    setter.socket.emit(GAME_C2S.action, {
      roomId: ROOM,
      type: HANGMAN_ACTION.commitWord,
      payload: { word: 'ECHO' },
    });
    await Promise.all([
      setter.waitFor((v) => v.phase === 'guessing' && v.mask === '____'),
      guesser.waitFor((v) => v.phase === 'guessing' && v.mask === '____'),
    ]);

    guesser.socket.emit(GAME_C2S.action, {
      roomId: ROOM,
      type: HANGMAN_ACTION.guessLetter,
      payload: { letter: 'E' },
    });
    await guesser.waitFor(
      (v) => v.mask === 'E___' && v.guessedLetters.includes('E'),
    );

    guesser.socket.emit(GAME_C2S.action, {
      roomId: ROOM,
      type: HANGMAN_ACTION.guessLetter,
      payload: { letter: 'C' },
    });
    guesser.socket.emit(GAME_C2S.action, {
      roomId: ROOM,
      type: HANGMAN_ACTION.guessLetter,
      payload: { letter: 'H' },
    });
    guesser.socket.emit(GAME_C2S.action, {
      roomId: ROOM,
      type: HANGMAN_ACTION.guessLetter,
      payload: { letter: 'O' },
    });
    await Promise.all([
      setter.waitFor(
        (v) => v.phase === 'round_over' && v.roundResult === 'won',
      ),
      guesser.waitFor(
        (v) => v.phase === 'round_over' && v.roundResult === 'won',
      ),
    ]);

    guesser.socket.emit(GAME_C2S.action, {
      roomId: ROOM,
      type: HANGMAN_ACTION.nextRound,
      payload: { completedRoundSeq: 0 },
    });
    await setter.waitFor(
      (v) => v.roundSeq === 1 && v.phase === 'setter_picking',
    );

    console.log('✓ hangman.socket: commit, guess, win, next round');
  } finally {
    for (const t of trackers) t.socket.disconnect();
    await server.close();
  }
}
