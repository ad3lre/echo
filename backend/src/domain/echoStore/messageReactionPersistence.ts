import type pg from 'pg';
import type { MessageReaction } from '../../../../shared/types';
import {
  getEchoMessageById,
  listAggregatedReactionsForMessages,
  normalizeReactionEmojiKey,
  removeEchoMessageReaction,
  upsertEchoMessageReaction,
  userHasEchoMessageReaction,
} from '../echoMessagesDal';
import {
  canUserAccessChannel,
  canUserAddMessageReaction,
  getEchoChannelServerId,
  isUserCommunicationTimedOut,
} from './access';

export type EchoReactionToggleResult =
  | { ok: true; reactions: MessageReaction[] }
  | {
      ok: false;
      code: 'NOT_FOUND' | 'FORBIDDEN' | 'VALIDATION';
      detail?: string;
    };

async function loadAggregatedReactionsForMessage(
  pool: pg.Pool,
  messageId: string,
): Promise<MessageReaction[]> {
  const map = await listAggregatedReactionsForMessages(pool, [messageId]);
  return map.get(messageId) ?? [];
}

export async function persistToggleEchoMessageReaction(
  pool: pg.Pool,
  userId: string,
  channelId: string,
  messageId: string,
  emojiRaw: string,
): Promise<EchoReactionToggleResult> {
  const emoji = normalizeReactionEmojiKey(emojiRaw);
  if (!emoji) {
    return { ok: false, code: 'VALIDATION' };
  }

  const msg = await getEchoMessageById(pool, messageId);
  if (!msg || msg.channelId !== channelId) {
    return { ok: false, code: 'NOT_FOUND' };
  }

  const sid = await getEchoChannelServerId(pool, channelId);
  if (sid && (await isUserCommunicationTimedOut(pool, sid, userId))) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      detail: 'You are in a communication timeout in this server.',
    };
  }

  const has = await userHasEchoMessageReaction(pool, messageId, userId, emoji);
  if (has) {
    if (!(await canUserAccessChannel(pool, userId, channelId))) {
      return { ok: false, code: 'FORBIDDEN' };
    }
    await removeEchoMessageReaction(pool, messageId, userId, emoji);
  } else {
    if (!(await canUserAddMessageReaction(pool, userId, channelId))) {
      return { ok: false, code: 'FORBIDDEN' };
    }
    await upsertEchoMessageReaction(pool, messageId, userId, emoji);
  }

  const reactions = await loadAggregatedReactionsForMessage(pool, messageId);
  return { ok: true, reactions };
}

export async function persistAddEchoMessageReaction(
  pool: pg.Pool,
  userId: string,
  channelId: string,
  messageId: string,
  emojiRaw: string,
): Promise<EchoReactionToggleResult> {
  const emoji = normalizeReactionEmojiKey(emojiRaw);
  if (!emoji) return { ok: false, code: 'VALIDATION' };
  const msg = await getEchoMessageById(pool, messageId);
  if (!msg || msg.channelId !== channelId)
    return { ok: false, code: 'NOT_FOUND' };
  const sid = await getEchoChannelServerId(pool, channelId);
  if (sid && (await isUserCommunicationTimedOut(pool, sid, userId))) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      detail: 'You are in a communication timeout in this server.',
    };
  }
  if (!(await canUserAddMessageReaction(pool, userId, channelId)))
    return { ok: false, code: 'FORBIDDEN' };
  await upsertEchoMessageReaction(pool, messageId, userId, emoji);
  const reactions = await loadAggregatedReactionsForMessage(pool, messageId);
  return { ok: true, reactions };
}

export async function persistRemoveEchoMessageReaction(
  pool: pg.Pool,
  userId: string,
  channelId: string,
  messageId: string,
  emojiRaw: string,
): Promise<EchoReactionToggleResult> {
  const emoji = normalizeReactionEmojiKey(emojiRaw);
  if (!emoji) return { ok: false, code: 'VALIDATION' };
  const msg = await getEchoMessageById(pool, messageId);
  if (!msg || msg.channelId !== channelId)
    return { ok: false, code: 'NOT_FOUND' };
  const sid = await getEchoChannelServerId(pool, channelId);
  if (sid && (await isUserCommunicationTimedOut(pool, sid, userId))) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      detail: 'You are in a communication timeout in this server.',
    };
  }
  if (!(await canUserAccessChannel(pool, userId, channelId)))
    return { ok: false, code: 'FORBIDDEN' };
  await removeEchoMessageReaction(pool, messageId, userId, emoji);
  const reactions = await loadAggregatedReactionsForMessage(pool, messageId);
  return { ok: true, reactions };
}
