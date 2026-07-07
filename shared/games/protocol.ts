/**
 * Wire contract between the Echo client and the authoritative game server.
 *
 * The game server is a standalone process (see `game-server/`). It owns game
 * state; clients send intents (`action`) and render authoritative per-viewer
 * snapshots. This replaces the legacy P2P-over-LiveKit model where one elected
 * client was the authority. TS-only — shared by both sides, no runtime deps.
 */

import type { EchoVcActivityKey } from '../vcActivityCatalog';

/**
 * Short-lived token the Echo backend mints (HS256, `JWT_SECRET`) once it has
 * authenticated the user and authorized them for `roomId`. The game server
 * verifies it standalone — no auth-DB coupling. Mirrors the LiveKit token flow.
 */
export interface GameTokenPayload {
  /** Echo user id. */
  sub: string;
  username: string;
  /** Authoritative room (today: the voice-channel id the activity is open in). */
  roomId: string;
  gameKey: EchoVcActivityKey;
  iat?: number;
  exp?: number;
}

/** Client → server Socket.IO event names. */
export const GAME_C2S = {
  join: 'game:join',
  leave: 'game:leave',
  action: 'game:action',
} as const;

/** Server → client Socket.IO event names. */
export const GAME_S2C = {
  /** Full per-viewer view of authoritative state (secrets redacted per viewer). */
  snapshot: 'game:snapshot',
  /** Transient side-effect cue (sfx/toast/relay) that is not part of state. */
  event: 'game:event',
  error: 'game:error',
} as const;

export interface GameJoinMsg {
  roomId: string;
  gameKey: EchoVcActivityKey;
}

export interface GameLeaveMsg {
  roomId: string;
}

export interface GameActionMsg<P = unknown> {
  roomId: string;
  /** Game-specific action discriminator (e.g. `place_mark`, `guess`). */
  type: string;
  payload?: P;
}

export interface GameSnapshotMsg<V = unknown> {
  roomId: string;
  gameKey: EchoVcActivityKey;
  /** Monotonic per-instance revision; clients drop stale snapshots. */
  rev: number;
  view: V;
}

export interface GameEventMsg<D = unknown> {
  roomId: string;
  /** e.g. `sfx`, `relay`, `toast`. */
  kind: string;
  data?: D;
}

export type GameErrorReason =
  | 'unauthorized'
  | 'not_configured'
  | 'room_mismatch'
  | 'unknown_game'
  | 'not_in_room'
  | 'invalid_action'
  | 'rejected';

export interface GameErrorMsg {
  reason: GameErrorReason;
  detail?: string;
}
