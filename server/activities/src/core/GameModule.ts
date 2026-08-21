import type { EchoVcActivityKey } from '../../cores/vcActivityCatalog';

/** Context handed to a module when an instance is first created for a room. */
export interface RoomCtx {
  roomId: string;
  gameKey: EchoVcActivityKey;
  now: number;
}

/** Context for a single client action. `roster` is the sorted set of joined users. */
export interface ActionCtx {
  userId: string;
  /** Game-specific action discriminator from `GameActionMsg.type`. */
  type: string;
  now: number;
  roster: readonly string[];
}

/**
 * The contract every game implements server-side. Implementations wrap an
 * existing pure core (e.g. `server/activities/cores/games/ticTacToe`) — the authority logic is
 * the same code the client used to run as the elected "orchestrator", now run
 * once, on the server.
 *
 * State `S` lives only on the server. `serializeFor` is the single seam through
 * which any state reaches a client, so per-viewer secret redaction (Skriggles
 * word, Codenames key) happens there and nowhere else.
 */
export interface GameModule<S = unknown, V = unknown> {
  readonly key: EchoVcActivityKey;
  /** 0 = event-driven only; >0 = the scheduler calls `tick()` ~this many times/sec. */
  readonly tickHz: number;

  createInitialState(ctx: RoomCtx): S;

  /** Apply a validated client action. Return next state, or `null` to reject (no change). */
  reduce(state: S, payload: unknown, ctx: ActionCtx): S | null;

  /** Advance timers/phases. Return next state, or `null` when nothing changed. */
  tick?(state: S, now: number, roster: readonly string[]): S | null;

  /** Per-viewer projection — the ONLY state that reaches a client. Redact secrets here. */
  serializeFor(viewerId: string, state: S): V;

  onJoin?(state: S, userId: string, now: number): S | null;
  onLeave?(state: S, userId: string, now: number): S | null;

  /**
   * Optional relay for actions that fan out without mutating state (e.g.
   * Skriggles canvas strokes). When `reduce` returns null, `relay` may still
   * emit a room event.
   */
  relay?(
    state: S,
    payload: unknown,
    ctx: ActionCtx,
  ): { kind: string; data?: unknown } | null;
}
