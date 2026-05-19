import type { Server } from 'socket.io';
import type pg from 'pg';
import { incrementEchoEmojiUsage } from '../domain/echoStore/emojiLibrary';
import {
  persistAddEchoMessageReaction,
  persistRemoveEchoMessageReaction,
  persistToggleEchoMessageReaction,
  type EchoReactionToggleResult,
} from '../domain/echoStore/messageReactionPersistence';
import { broadcastEchoMessageReactionsSnapshot } from '../sockets/echoMessageReactionsBroadcast';

export type { EchoReactionToggleResult };

function scheduleCustomEmojiUsageIncrement(
  pool: pg.Pool,
  channelId: string,
  userId: string,
  emoji: string,
): void {
  if (!emoji.includes(':')) return;
  const emojiId = emoji.split(':').pop();
  if (!emojiId) return;
  void (async () => {
    try {
      const serverId = await pool
        .query<{
          server_id: string;
        }>(`SELECT server_id FROM echo_channels WHERE id = $1`, [channelId])
        .then((r) => r.rows[0]?.server_id);
      if (serverId) {
        await incrementEchoEmojiUsage(pool, serverId, userId, emojiId);
      }
    } catch {
      /* ignore */
    }
  })();
}

export async function toggleEchoMessageReactionAndBroadcast(
  pool: pg.Pool,
  io: Server,
  userId: string,
  channelId: string,
  messageId: string,
  emojiRaw: string,
): Promise<EchoReactionToggleResult> {
  const r = await persistToggleEchoMessageReaction(
    pool,
    userId,
    channelId,
    messageId,
    emojiRaw,
  );
  if (!r.ok) return r;
  broadcastEchoMessageReactionsSnapshot(io, channelId, messageId, r.reactions);
  scheduleCustomEmojiUsageIncrement(pool, channelId, userId, emojiRaw);
  return r;
}

export async function addEchoMessageReactionAndBroadcast(
  pool: pg.Pool,
  io: Server,
  userId: string,
  channelId: string,
  messageId: string,
  emojiRaw: string,
): Promise<EchoReactionToggleResult> {
  const r = await persistAddEchoMessageReaction(
    pool,
    userId,
    channelId,
    messageId,
    emojiRaw,
  );
  if (!r.ok) return r;
  broadcastEchoMessageReactionsSnapshot(io, channelId, messageId, r.reactions);
  scheduleCustomEmojiUsageIncrement(pool, channelId, userId, emojiRaw);
  return r;
}

export async function removeEchoMessageReactionAndBroadcast(
  pool: pg.Pool,
  io: Server,
  userId: string,
  channelId: string,
  messageId: string,
  emojiRaw: string,
): Promise<EchoReactionToggleResult> {
  const r = await persistRemoveEchoMessageReaction(
    pool,
    userId,
    channelId,
    messageId,
    emojiRaw,
  );
  if (!r.ok) return r;
  broadcastEchoMessageReactionsSnapshot(io, channelId, messageId, r.reactions);
  return r;
}
