import { randomUUID } from 'node:crypto';
import { JSONCodec, type NatsConnection } from 'nats';
import type { Server } from 'socket.io';
import { config } from '../config';
import { getNatsConnection } from '../db/nats';
import { getPgPool } from '../db/pg';
import { canUserAccessChannel } from '../domain/permissions/echoPermissions';

const ECHO_CHANNEL_FANOUT_SUBJECT = 'echo.channel.fanout.v1';
const fanoutCodec = JSONCodec<EchoChannelFanoutEnvelope>();
const nodeIds = new WeakMap<Server, string>();

interface EchoChannelFanoutEnvelope {
  sourceNodeId: string;
  channelId: string;
  event: string;
  payload: unknown;
}

function nodeIdFor(io: Server): string {
  const current = nodeIds.get(io);
  if (current) return current;
  const created = randomUUID();
  nodeIds.set(io, created);
  return created;
}

export async function emitToAuthorizedLocalChannelSockets(
  io: Server,
  channelId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    if (!config.isProduction) io.local.to(channelId).emit(event, payload);
    return;
  }
  const sockets = await io.local.in(channelId).fetchSockets();
  await Promise.all(
    sockets.map(async (socket) => {
      if (!socket.data?.authenticated) return;
      const userId = String(socket.data.userId ?? '').trim();
      if (!userId) return;
      if (await canUserAccessChannel(pool, userId, channelId)) {
        socket.emit(event, payload);
      }
    }),
  );
}

export function publishEchoChannelFanout(
  io: Server,
  channelId: string,
  event: string,
  payload: unknown,
): void {
  getNatsConnection()?.publish(
    ECHO_CHANNEL_FANOUT_SUBJECT,
    fanoutCodec.encode({
      sourceNodeId: nodeIdFor(io),
      channelId,
      event,
      payload,
    }),
  );
}

export function subscribeToEchoChannelFanout(
  io: Server,
  nc: NatsConnection,
): void {
  const sourceNodeId = nodeIdFor(io);
  nc.subscribe(ECHO_CHANNEL_FANOUT_SUBJECT, {
    callback: (error, message) => {
      if (error) return;
      try {
        const envelope = fanoutCodec.decode(message.data);
        if (envelope.sourceNodeId === sourceNodeId) return;
        void emitToAuthorizedLocalChannelSockets(
          io,
          envelope.channelId,
          envelope.event,
          envelope.payload,
        ).catch(() => {
          // Authorization failures fail closed on the receiving node.
        });
      } catch {
        // Invalid fan-out envelopes fail closed.
      }
    },
  });
}
