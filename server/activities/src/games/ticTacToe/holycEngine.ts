import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import type { TttCell, TttTerminal } from '../../../cores/games/ticTacToe/core';

export type HolyCTttMark = 'X' | 'O';

export interface HolyCTttSnapshot {
  revision: number;
  status: TttTerminal;
  currentTurn: HolyCTttMark;
  board: TttCell[];
}

type HolyCTttResponse =
  | { kind: 'ok'; snapshot: HolyCTttSnapshot }
  | { kind: 'reject'; revision: number; reason: string };

interface PendingLine {
  resolve: (response: HolyCTttResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface HolyCTttEngineOptions {
  command: string;
  args?: readonly string[];
  timeoutMs?: number;
  /** Explicit child environment. Secrets from the gateway are never inherited. */
  env?: NodeJS.ProcessEnv;
}

const STATUSES: readonly TttTerminal[] = [
  'playing',
  'draw',
  'x_wins',
  'o_wins',
];

function parseResponse(line: string): HolyCTttResponse {
  const fields = line.split('\t');
  if (fields[0] === 'reject' && fields.length >= 3) {
    const revision = Number(fields[1]);
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new Error('HolyC engine returned an invalid rejection revision');
    }
    return {
      kind: 'reject',
      revision,
      reason: fields.slice(2).join('\t').slice(0, 128) || 'rejected',
    };
  }

  if (fields[0] !== 'ok' || fields.length !== 5) {
    throw new Error('HolyC engine returned a malformed response');
  }
  const revision = Number(fields[1]);
  const status = fields[2] as TttTerminal;
  const currentTurn = fields[3] as HolyCTttMark;
  const board = fields[4];
  if (
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !STATUSES.includes(status) ||
    (currentTurn !== 'X' && currentTurn !== 'O') ||
    !/^[012]{9}$/.test(board)
  ) {
    throw new Error('HolyC engine returned invalid game state');
  }

  return {
    kind: 'ok',
    snapshot: {
      revision,
      status,
      currentTurn,
      board: [...board].map((cell) =>
        cell === '1' ? 'X' : cell === '2' ? 'O' : '',
      ),
    },
  };
}

/**
 * Supervises one HolyC tic-tac-toe process. The child receives only game
 * moves, never identity or authorization data. Requests are serialized and
 * accepted moves are replayed after a child restart so a crash cannot silently
 * reset the room state.
 */
export class HolyCTicTacToeEngine {
  private child: ChildProcessWithoutNullStreams | null = null;
  private reader: Interface | null = null;
  private pending: PendingLine | null = null;
  private chain: Promise<void> = Promise.resolve();
  private acceptedMoves: Array<{
    revision: number;
    cell: number;
    mark: HolyCTttMark;
  }> = [];
  private initialized = false;
  private closed = false;

  constructor(private readonly options: HolyCTttEngineOptions) {}

  apply(
    revision: number,
    cell: number,
    mark: HolyCTttMark,
  ): Promise<HolyCTttSnapshot | null> {
    return this.enqueue(async () => {
      const response = await this.requestWithRecovery(
        `move\t${revision}\t${cell}\t${mark}`,
      );
      if (response.kind === 'reject') return null;
      if (response.snapshot.revision !== revision) {
        throw new Error(
          'HolyC engine revision does not match the room revision',
        );
      }
      this.acceptedMoves.push({ revision, cell, mark });
      return response.snapshot;
    });
  }

  reset(revision: number): Promise<void> {
    return this.enqueue(async () => {
      const response = await this.requestWithRecovery(`reset\t${revision}`);
      if (response.kind !== 'ok' || response.snapshot.revision !== revision) {
        throw new Error('HolyC engine rejected a room reset');
      }
      this.acceptedMoves = [];
    });
  }

  dispose(): void {
    this.closed = true;
    this.failPending(new Error('HolyC engine disposed'));
    this.terminateChild();
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.chain.then(operation, operation);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async requestWithRecovery(line: string): Promise<HolyCTttResponse> {
    await this.ensureReady();
    return this.sendLine(line);
  }

  private async ensureReady(): Promise<void> {
    if (this.closed) throw new Error('HolyC engine is closed');
    if (!this.child) this.startChild();
    if (this.initialized) return;

    const reset = await this.sendLine('reset\t0');
    if (
      reset.kind !== 'ok' ||
      reset.snapshot.revision !== 0 ||
      reset.snapshot.status !== 'playing'
    ) {
      throw new Error('HolyC engine failed its initial reset');
    }
    for (const move of this.acceptedMoves) {
      const replay = await this.sendLine(
        `move\t${move.revision}\t${move.cell}\t${move.mark}`,
      );
      if (replay.kind !== 'ok' || replay.snapshot.revision !== move.revision) {
        throw new Error('HolyC engine failed state recovery');
      }
    }
    this.initialized = true;
  }

  private startChild(): void {
    if (this.closed) throw new Error('HolyC engine is closed');
    const child = spawn(this.options.command, [...(this.options.args ?? [])], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env:
        this.options.env ??
        ({
          PATH: process.env.PATH ?? '',
          LANG: process.env.LANG ?? 'C',
          NODE_ENV: process.env.NODE_ENV ?? 'production',
        } satisfies NodeJS.ProcessEnv),
      shell: false,
    });
    this.child = child;
    this.reader = createInterface({ input: child.stdout });
    this.reader.on('line', (line) => this.handleLine(line));
    child.on('error', (error) => this.failChild(child, error));
    child.on('exit', (code, signal) => {
      this.failChild(
        child,
        new Error(
          `HolyC engine exited (${signal ?? `code ${code ?? 'unknown'}`})`,
        ),
      );
    });
    // Keep diagnostics out of the protocol stream. The supervisor deliberately
    // does not forward child stderr to clients.
    child.stderr.resume();
  }

  private sendLine(line: string): Promise<HolyCTttResponse> {
    const child = this.child;
    if (!child || !child.stdin.writable) {
      throw new Error('HolyC engine is unavailable');
    }
    if (this.pending) throw new Error('HolyC engine request overlap');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        this.terminateChild();
        reject(new Error('HolyC engine response timed out'));
      }, this.options.timeoutMs ?? 1_000);
      this.pending = { resolve, reject, timer };
      child.stdin.write(`${line}\n`, (error) => {
        if (error) this.failChild(child, error);
      });
    });
  }

  private handleLine(line: string): void {
    const pending = this.pending;
    if (!pending) {
      this.failChild(
        this.child,
        new Error('HolyC engine emitted an unsolicited line'),
      );
      return;
    }
    this.pending = null;
    clearTimeout(pending.timer);
    try {
      pending.resolve(parseResponse(line));
    } catch (error) {
      this.terminateChild();
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private failPending(error: Error): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  private failChild(
    child: ChildProcessWithoutNullStreams | null,
    error: Error,
  ): void {
    if (!child || this.child !== child) return;
    this.child = null;
    this.initialized = false;
    this.reader?.close();
    this.reader = null;
    this.failPending(error);
  }

  private terminateChild(): void {
    const child = this.child;
    this.child = null;
    this.initialized = false;
    this.reader?.close();
    this.reader = null;
    if (child && !child.killed) child.kill('SIGKILL');
  }
}
