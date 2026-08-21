import { connect, type NatsConnection } from 'nats';

let connection: NatsConnection | null = null;

/**
 * Connect to NATS for the Socket.IO adapter (cross-node broadcast), mirroring
 * the backend's `db/nats.ts`. Optional: when `NATS_URL` is unset the server runs
 * single-process with the default in-memory adapter.
 */
export async function connectGameNats(
  url: string,
): Promise<NatsConnection | null> {
  if (connection) return connection;
  connection = await connect({ servers: url });
  connection
    .closed()
    .then((err) => {
      if (err) console.error('[game-server][nats] closed with error:', err);
      connection = null;
    })
    .catch(() => {
      connection = null;
    });
  return connection;
}
