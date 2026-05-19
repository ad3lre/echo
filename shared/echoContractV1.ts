/**
 * Echo Contract v1 — machine-readable surface for CI/tests.
 * @see docs/contracts/ECHO_CONTRACT_V1.md
 */

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from './types/socket';

/** All client → server event names (must match `ClientToServerEvents` keys). */
export const ECHO_V1_CLIENT_SOCKET_EVENTS = [
  'message',
  'poll:vote',
  'message:edit',
  'message:delete',
  'message:reaction_toggle',
  'message:pin',
  'message:unpin',
  'joinChannel',
  'leaveChannel',
  'presence:set',
  'presence:heartbeat',
  'dm_call:invite',
  'dm_call:accept',
  'dm_call:end',
  'channel:typing',
] as const satisfies readonly (keyof ClientToServerEvents)[];

/** All server → client event names (must match `ServerToClientEvents` keys). */
export const ECHO_V1_SERVER_SOCKET_EVENTS = [
  'message',
  'message_ack',
  'message_failed',
  'presence:update',
  'dm:activity',
  'dm:call',
  'dm:thread:activity',
  'read_state:update',
  'attention:update',
  'message:updated',
  'message:deleted',
  'message:embeds',
  'message:reactions',
  'message:pins',
  'echo:workspace_event',
  'poll:updated',
  'poll:vote_failed',
  'channel:typing',
  'app:deploy_countdown',
] as const satisfies readonly (keyof ServerToClientEvents)[];

/** Compile-time: allowlist must enumerate every `ClientToServerEvents` key. */
type _EchoV1ClientSocketContractComplete =
  Exclude<
    keyof ClientToServerEvents,
    (typeof ECHO_V1_CLIENT_SOCKET_EVENTS)[number]
  > extends never
    ? true
    : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- exhaustiveness token
const _echoV1ClientSocketContractComplete: _EchoV1ClientSocketContractComplete = true;

/** Compile-time: allowlist must enumerate every `ServerToClientEvents` key. */
type _EchoV1ServerSocketContractComplete =
  Exclude<
    keyof ServerToClientEvents,
    (typeof ECHO_V1_SERVER_SOCKET_EVENTS)[number]
  > extends never
    ? true
    : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- exhaustiveness token
const _echoV1ServerSocketContractComplete: _EchoV1ServerSocketContractComplete = true;
