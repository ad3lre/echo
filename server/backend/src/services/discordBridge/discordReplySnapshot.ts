import type pg from 'pg';
import type { ReplyTo } from '../../../../../contracts/types';
import { getEchoMessageById } from '../../domain/echoMessagesDal';

export type DiscordMessageReferenceLike = {
  messageId?: string;
  channelId?: string;
};

export function parseDiscordMessageReference(
  raw: unknown,
): DiscordMessageReferenceLike | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const messageId =
    typeof o.messageId === 'string'
      ? o.messageId.trim()
      : typeof o.message_id === 'string'
        ? o.message_id.trim()
        : '';
  if (!messageId) return undefined;
  const channelId =
    typeof o.channelId === 'string'
      ? o.channelId.trim()
      : typeof o.channel_id === 'string'
        ? o.channel_id.trim()
        : undefined;
  return { messageId, ...(channelId ? { channelId } : {}) };
}

/**
 * Build a persisted `reply_to` snapshot when the quoted parent is already in Echo
 * (Discord import uses Discord snowflakes as message ids).
 */
export async function buildEchoReplyToSnapshot(
  pool: pg.Pool,
  echoChannelId: string,
  parentMessageId: string,
  discordChannelId?: string,
): Promise<ReplyTo | undefined> {
  const mid = parentMessageId.trim();
  if (!mid) return undefined;
  const row = await getEchoMessageById(pool, mid);
  if (!row || row.channelId !== echoChannelId) return undefined;
  if (discordChannelId) {
    const refChannel = discordChannelId.trim();
    if (refChannel && refChannel !== discordChannelId) return undefined;
  }
  const plain = (row.searchIndexText ?? row.content ?? '').trim();
  const preview = plain.length > 500 ? `${plain.slice(0, 499)}…` : plain;
  return {
    messageId: row.id,
    authorId: row.authorId,
    authorName: row.authorDisplayName?.trim() || 'Unknown',
    ...(row.authorAvatar ? { authorAvatar: row.authorAvatar } : {}),
    content: preview || '(no text)',
  };
}
