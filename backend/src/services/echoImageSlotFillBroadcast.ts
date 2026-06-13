import type { FastifyBaseLogger } from 'fastify';
import type { Server } from 'socket.io';
import type pg from 'pg';
import type { MentionEntity } from '../../../shared/types';
import { fillEchoMessageImageSlot } from '../domain/imageSlotFillOps';
import { getEchoMessageById } from '../domain/echoStore';
import { broadcastToEchoChannel } from '../sockets/channelBroadcast';
import { registerChatUploadRetentionFromMessageUrls } from './chatUploadRetention';

export async function fillEchoMessageImageSlotAndBroadcast(
  pool: pg.Pool,
  io: Server,
  log: FastifyBaseLogger,
  channelId: string,
  messageId: string,
  editorId: string,
  slotId: string,
  fill: {
    imageUrl: string;
    storageKey?: string;
    width?: number;
    height?: number;
  },
): Promise<
  | 'ok'
  | 'not_found'
  | 'forbidden'
  | 'invalid_format'
  | 'slot_not_found'
  | 'slot_already_filled'
> {
  const result = await fillEchoMessageImageSlot(
    pool,
    channelId,
    messageId,
    editorId,
    slotId,
    fill,
  );
  if (!result.ok) {
    return result.code === 'invalid_doc' ? 'invalid_format' : result.code;
  }

  if (fill.storageKey) {
    try {
      await registerChatUploadRetentionFromMessageUrls(pool, {
        uploaderId: editorId,
        imageUrl: fill.imageUrl,
      });
    } catch (e) {
      log.warn(
        { err: e, channelId, messageId, slotId },
        'image slot fill retention registration failed',
      );
    }
  }

  const row = await getEchoMessageById(pool, messageId);
  const editedAt = row?.editedAt ?? new Date().toISOString();
  const plain = row?.searchIndexText ?? row?.content ?? result.content;
  const mf = row?.messageFormatVersion ?? 2;
  const cs = row?.contentSchemaVersion ?? 2;
  broadcastToEchoChannel(io, channelId, 'message:updated', {
    channelId,
    messageId,
    content: plain,
    contentText: plain,
    editedAt,
    contentJson: result.contentJson,
    messageFormatVersion: mf,
    contentSchemaVersion: cs,
    ...(row?.mentions !== undefined
      ? { mentions: row.mentions as MentionEntity[] }
      : {}),
    ...(row?.attachments !== undefined ? { attachments: row.attachments } : {}),
  });

  return 'ok';
}
