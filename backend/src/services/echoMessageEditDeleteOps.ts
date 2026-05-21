import type { Server } from 'socket.io';
import type pg from 'pg';
import {
  softDeleteEchoMessage,
  updateEchoMessageContent,
  type EchoMessageEditBody,
} from '../domain/echoStore/messageOps';
import {
  getEchoChannelServerId,
  getEchoMessageById,
  insertEchoAudit,
} from '../domain/echoStore';
import { bulkSoftDeleteEchoMessagesForAuthorInServerSince } from '../domain/echoMessagesDal';
import { broadcastToEchoChannel } from '../sockets/channelBroadcast';
import { resolveAndBroadcastLinkEmbeds } from '../sockets/echoLinkEmbeds';
import type { MentionEntity } from '../../../shared/types';
import type { FastifyBaseLogger } from 'fastify';
import { botEventBus } from '../platform/botEventBus';

export async function editEchoMessageAndBroadcast(
  pool: pg.Pool,
  io: Server,
  log: FastifyBaseLogger,
  channelId: string,
  messageId: string,
  editorId: string,
  body: EchoMessageEditBody,
): Promise<'ok' | 'not_found' | 'forbidden'> {
  const r = await updateEchoMessageContent(
    pool,
    channelId,
    messageId,
    editorId,
    body,
  );
  if (r !== 'ok') return r;

  const row = await getEchoMessageById(pool, messageId);
  if (!row) return 'not_found';
  if (row.channelId !== channelId) return 'not_found';

  const editedAt = row.editedAt ?? new Date().toISOString();
  const plain = row.searchIndexText ?? row.content ?? '';
  const mf = row.messageFormatVersion ?? (body.kind === 'json' ? 2 : 1);
  const cs =
    row.contentSchemaVersion ??
    (body.kind === 'json' ? body.contentSchemaVersion : 1);

  const sid = await getEchoChannelServerId(pool, channelId);
  if (sid) {
    await insertEchoAudit(
      pool,
      sid,
      editorId,
      'message.edit',
      'message',
      messageId,
      {
        channelId,
        authorId: row.authorId,
      },
    );
    botEventBus.emitBotEvent({
      kind: 'message:updated',
      channelId,
      serverId: sid,
      messageId,
      content: plain,
      editedAt,
    });
  }

  io.to(channelId).emit('message:updated', {
    channelId,
    messageId,
    content: plain,
    contentText: plain,
    editedAt,
    ...(mf >= 2 && row.contentJson !== undefined
      ? { contentJson: row.contentJson }
      : {}),
    messageFormatVersion: mf,
    contentSchemaVersion: cs,
    ...(row.mentions !== undefined
      ? { mentions: row.mentions as MentionEntity[] }
      : {}),
    ...(row.attachments !== undefined ? { attachments: row.attachments } : {}),
  });

  void resolveAndBroadcastLinkEmbeds(pool, io, log, {
    channelId,
    messageId,
    authorId: row.authorId,
    content: plain,
    ...(mf >= 2 && row.contentJson !== undefined
      ? { contentJson: row.contentJson }
      : {}),
  });

  return 'ok';
}

export async function deleteEchoMessageAndBroadcast(
  pool: pg.Pool,
  io: Server,
  channelId: string,
  messageId: string,
  actorId: string,
  asModerator: boolean,
): Promise<'ok' | 'not_found' | 'forbidden'> {
  const before = await getEchoMessageById(pool, messageId);
  if (!before || before.channelId !== channelId) return 'not_found';

  const r = await softDeleteEchoMessage(
    pool,
    channelId,
    messageId,
    actorId,
    asModerator,
  );
  if (r !== 'ok') return r;

  const sid = await getEchoChannelServerId(pool, channelId);
  if (sid) {
    await insertEchoAudit(
      pool,
      sid,
      actorId,
      'message.delete',
      'message',
      messageId,
      {
        channelId,
        authorId: before.authorId,
        asModerator,
      },
    );
    botEventBus.emitBotEvent({
      kind: 'message:deleted',
      channelId,
      serverId: sid,
      messageId,
    });
  }

  broadcastToEchoChannel(io, channelId, 'message:deleted', {
    channelId,
    messageId,
  });

  return 'ok';
}

/**
 * After a ban, remove this author's recent messages across the server and notify clients.
 * {@link hoursBack} must be a positive whitelist value (e.g. 1, 24, 72, 168).
 */
export async function purgeEchoAuthorRecentMessagesInServerAndBroadcast(
  pool: pg.Pool,
  io: Server,
  serverId: string,
  targetAuthorId: string,
  hoursBack: number,
): Promise<number> {
  if (!(hoursBack > 0)) return 0;
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const rows = await bulkSoftDeleteEchoMessagesForAuthorInServerSince(
    pool,
    serverId,
    targetAuthorId,
    since,
  );
  for (const { channelId, messageId } of rows) {
    broadcastToEchoChannel(io, channelId, 'message:deleted', {
      channelId,
      messageId,
    });
  }
  return rows.length;
}
