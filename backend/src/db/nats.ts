/**
 * NATS client.
 * Connects when NATS_URL is set.
 * Used for Socket.IO adapter, presence, and messaging.
 */

import { connect, type NatsConnection } from 'nats';
import { config } from '../config';

let connection: NatsConnection | null = null;

export function getNatsConnection(): NatsConnection | null {
  if (!config.natsUrl) {
    return null;
  }
  return connection;
}

export async function connectNats(): Promise<NatsConnection | null> {
  if (!config.natsUrl) {
    return null;
  }
  if (connection) {
    return connection;
  }
  connection = await connect({ servers: config.natsUrl });
  connection
    .closed()
    .then((err) => {
      void err;
      connection = null;
    })
    .catch(() => {
      connection = null;
    });
  return connection;
}

export async function disconnectNats(): Promise<void> {
  if (connection) {
    await connection.drain();
    connection = null;
  }
}
