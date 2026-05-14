import type pg from 'pg';
import { getEchoMessageById } from '../echoMessagesDal';
import {
  canUserAccessChannel,
  getEchoChannelServerId,
  isUserCommunicationTimedOut,
} from './access';
import { ECHO_DM_REALM_SERVER_ID } from './dmThreads';

export async function listPinnedMessageIdsForChannel(
  pool: pg.Pool,
  channelId: string,
): Promise<string[]> {
  const sid = await getEchoChannelServerId(pool, channelId);
  if (!sid || sid !== ECHO_DM_REALM_SERVER_ID) return [];
  const r = await pool.query(
    `SELECT message_id FROM echo_channel_pins WHERE channel_id = $1 ORDER BY pinned_at DESC`,
    [channelId],
  );
  return r.rows.map((row) => String(row.message_id));
}

export async function canUserPinMessagesInChannel(
  pool: pg.Pool,
  userId: string,
  channelId: string,
): Promise<boolean> {
  if (!(await canUserAccessChannel(pool, userId, channelId))) return false;
  const sid = await getEchoChannelServerId(pool, channelId);
  if (!sid) return false;
  if (sid === ECHO_DM_REALM_SERVER_ID) return true;
  return false;
}

export type EchoPinMutationResult =
  | { ok: true }
  | {
      ok: false;
      code: 'NOT_FOUND' | 'FORBIDDEN' | 'VALIDATION';
      detail?: string;
    };

export async function persistAddEchoChannelPin(
  pool: pg.Pool,
  userId: string,
  channelId: string,
  messageId: string,
): Promise<EchoPinMutationResult> {
  const mid = messageId.trim();
  if (!mid) return { ok: false, code: 'VALIDATION' };
  const msg = await getEchoMessageById(pool, mid);
  if (!msg || msg.channelId !== channelId)
    return { ok: false, code: 'NOT_FOUND' };
  const sid = await getEchoChannelServerId(pool, channelId);
  if (sid && sid !== ECHO_DM_REALM_SERVER_ID) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      detail: 'Pinned messages are disabled in servers.',
    };
  }
  if (sid && (await isUserCommunicationTimedOut(pool, sid, userId))) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      detail: 'You are in a communication timeout in this server.',
    };
  }
  if (!(await canUserPinMessagesInChannel(pool, userId, channelId)))
    return { ok: false, code: 'FORBIDDEN' };
  await pool.query(
    `
    INSERT INTO echo_channel_pins (channel_id, message_id, pinned_by)
    VALUES ($1, $2, $3)
    ON CONFLICT (channel_id, message_id) DO NOTHING
    `,
    [channelId, mid, userId],
  );
  return { ok: true };
}

export async function persistRemoveEchoChannelPin(
  pool: pg.Pool,
  userId: string,
  channelId: string,
  messageId: string,
): Promise<EchoPinMutationResult> {
  const mid = messageId.trim();
  if (!mid) return { ok: false, code: 'VALIDATION' };
  const sid = await getEchoChannelServerId(pool, channelId);
  if (sid && sid !== ECHO_DM_REALM_SERVER_ID) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      detail: 'Pinned messages are disabled in servers.',
    };
  }
  if (sid && (await isUserCommunicationTimedOut(pool, sid, userId))) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      detail: 'You are in a communication timeout in this server.',
    };
  }
  if (!(await canUserPinMessagesInChannel(pool, userId, channelId)))
    return { ok: false, code: 'FORBIDDEN' };
  await pool.query(
    `DELETE FROM echo_channel_pins WHERE channel_id = $1 AND message_id = $2`,
    [channelId, mid],
  );
  return { ok: true };
}
