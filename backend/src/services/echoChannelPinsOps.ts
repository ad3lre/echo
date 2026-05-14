import type { Server } from 'socket.io';
import type pg from 'pg';
import {
  persistAddEchoChannelPin,
  persistRemoveEchoChannelPin,
  type EchoPinMutationResult,
} from '../domain/echoStore/channelPinsPersistence';
import { broadcastEchoChannelPinsSnapshot } from '../sockets/echoChannelPinsBroadcast';

export async function addEchoChannelPinAndBroadcast(
  pool: pg.Pool,
  io: Server,
  userId: string,
  channelId: string,
  messageId: string,
): Promise<EchoPinMutationResult> {
  const r = await persistAddEchoChannelPin(pool, userId, channelId, messageId);
  if (!r.ok) return r;
  await broadcastEchoChannelPinsSnapshot(pool, io, channelId);
  return { ok: true };
}

export async function removeEchoChannelPinAndBroadcast(
  pool: pg.Pool,
  io: Server,
  userId: string,
  channelId: string,
  messageId: string,
): Promise<EchoPinMutationResult> {
  const r = await persistRemoveEchoChannelPin(
    pool,
    userId,
    channelId,
    messageId,
  );
  if (!r.ok) return r;
  await broadcastEchoChannelPinsSnapshot(pool, io, channelId);
  return { ok: true };
}
