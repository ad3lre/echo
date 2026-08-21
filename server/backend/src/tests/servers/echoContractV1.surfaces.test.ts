import assert from 'node:assert/strict';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../../../../contracts/types/socket';
import {
  ECHO_V1_CLIENT_SOCKET_EVENTS,
  ECHO_V1_SERVER_SOCKET_EVENTS,
} from '../../../../../contracts/echoContractV1';

/** Compile-time: `ECHO_V1_CLIENT_SOCKET_EVENTS` must match every `ClientToServerEvents` key. */
type _MissingClient = Exclude<
  keyof ClientToServerEvents,
  (typeof ECHO_V1_CLIENT_SOCKET_EVENTS)[number]
>;
type _ClientAllowlistComplete = [_MissingClient] extends [never] ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _clientAllowlistComplete: _ClientAllowlistComplete = true;

/** Compile-time: `ECHO_V1_SERVER_SOCKET_EVENTS` must match every `ServerToClientEvents` key. */
type _MissingServer = Exclude<
  keyof ServerToClientEvents,
  (typeof ECHO_V1_SERVER_SOCKET_EVENTS)[number]
>;
type _ServerAllowlistComplete = [_MissingServer] extends [never] ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _serverAllowlistComplete: _ServerAllowlistComplete = true;

function assertNoDuplicateEventNames(
  label: string,
  keys: readonly string[],
): void {
  const seen = new Set<string>();
  for (const k of keys) {
    assert.ok(!seen.has(k), `${label}: duplicate event name "${k}"`);
    seen.add(k);
  }
}

async function run(): Promise<void> {
  assertNoDuplicateEventNames('client', ECHO_V1_CLIENT_SOCKET_EVENTS);
  assertNoDuplicateEventNames('server', ECHO_V1_SERVER_SOCKET_EVENTS);

  const clientSet = new Set<string>(ECHO_V1_CLIENT_SOCKET_EVENTS);
  const serverSet = new Set<string>(ECHO_V1_SERVER_SOCKET_EVENTS);

  assert.equal(
    clientSet.size,
    ECHO_V1_CLIENT_SOCKET_EVENTS.length,
    'client: allowlist length must equal unique key count',
  );
  assert.equal(
    serverSet.size,
    ECHO_V1_SERVER_SOCKET_EVENTS.length,
    'server: allowlist length must equal unique key count',
  );

  console.log('echoContractV1.surfaces: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
