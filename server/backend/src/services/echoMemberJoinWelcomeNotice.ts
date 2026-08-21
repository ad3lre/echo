import type { FastifyBaseLogger } from 'fastify';
import type { Server } from 'socket.io';
import type pg from 'pg';
import type { Message } from '../../../../contracts/types';
import {
  ECHO_INTERNAL_SYSTEM_ACTOR_USER_ID,
  ECHO_MEMBER_JOIN_WELCOME_BRIDGE_SOURCE,
} from '../domain/echoChannelWebhookConstants';
import {
  attachAuthorLabelsToEchoMessageRows,
  getEchoMessageById,
  insertEchoMessage,
} from '../domain/echoMessagesDal';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import { echoMessagesPersistedTotal } from '../observability/echoMetrics';
import { broadcastToEchoChannel } from '../sockets/channelBroadcast';
import { echoRowToMessage } from './echoPersistedMessageCreate';

export function formatEchoMemberJoinWelcomeContent(
  displayLabel: string,
): string {
  const label = displayLabel.trim() || 'Someone';
  return `${label} joined the server.`;
}

async function resolveMemberJoinDisplayLabel(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<string> {
  const r = await pool.query(
    `
    SELECT
      NULLIF(TRIM(m.nickname), '') AS server_nickname,
      NULLIF(TRIM(u.display_name), '') AS display_name,
      NULLIF(TRIM(u.username), '') AS username
    FROM auth_users u
    LEFT JOIN echo_server_members m
      ON m.server_id = $1 AND m.user_id = u.id
    WHERE u.id = $2
    LIMIT 1
    `,
    [serverId, userId],
  );
  const row = r.rows[0] as
    | {
        server_nickname?: string | null;
        display_name?: string | null;
        username?: string | null;
      }
    | undefined;
  return (
    row?.server_nickname?.trim() ||
    row?.display_name?.trim() ||
    row?.username?.trim() ||
    'Someone'
  );
}

/**
 * Posts a Discord-style centered system message when a user joins, if the server
 * has a configured welcome channel.
 */
export async function postEchoMemberJoinWelcomeNotice(
  pool: pg.Pool,
  io: Server | undefined,
  log: FastifyBaseLogger,
  input: { serverId: string; userId: string },
): Promise<void> {
  const serverId = input.serverId.trim();
  const userId = input.userId.trim();
  if (!serverId || !userId) return;

  let welcomeChannelId: string | null = null;
  try {
    const srv = await pool.query(
      `SELECT welcome_channel_id FROM echo_servers WHERE id = $1 LIMIT 1`,
      [serverId],
    );
    const raw = srv.rows[0]?.welcome_channel_id;
    welcomeChannelId =
      typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  } catch (e) {
    log.warn(
      { err: e, msg: 'member_join_welcome.load_server_failed', serverId },
      'Member join welcome: failed to load server config',
    );
    return;
  }
  if (!welcomeChannelId) return;

  try {
    const ch = await pool.query(
      `
      SELECT id FROM echo_channels
      WHERE id = $1 AND server_id = $2 AND type = 'text'
      LIMIT 1
      `,
      [welcomeChannelId, serverId],
    );
    if (!ch.rows[0]) return;
  } catch (e) {
    log.warn(
      {
        err: e,
        msg: 'member_join_welcome.validate_channel_failed',
        serverId,
        welcomeChannelId,
      },
      'Member join welcome: failed to validate channel',
    );
    return;
  }

  let displayLabel = 'Someone';
  try {
    displayLabel = await resolveMemberJoinDisplayLabel(pool, serverId, userId);
  } catch (e) {
    log.warn(
      { err: e, msg: 'member_join_welcome.resolve_label_failed', userId },
      'Member join welcome: failed to resolve display label',
    );
  }

  const content = formatEchoMemberJoinWelcomeContent(displayLabel);
  const messageId = nextEchoSnowflakeId();
  try {
    const ins = await insertEchoMessage(pool, {
      id: messageId,
      channelId: welcomeChannelId,
      authorId: ECHO_INTERNAL_SYSTEM_ACTOR_USER_ID,
      content,
      searchIndexText: content,
      messageFormatVersion: 1,
      contentSchemaVersion: 1,
      systemMessage: true,
      bridgeSource: ECHO_MEMBER_JOIN_WELCOME_BRIDGE_SOURCE,
    });
    if (ins !== 'inserted') return;
  } catch (e) {
    log.warn(
      { err: e, msg: 'member_join_welcome.insert_failed', serverId, userId },
      'Member join welcome: message insert failed',
    );
    return;
  }

  echoMessagesPersistedTotal.inc({ result: 'inserted' });

  const row = await getEchoMessageById(pool, messageId);
  if (!row) return;

  const [labeled] = await attachAuthorLabelsToEchoMessageRows(pool, [row]);
  const messageForClients: Message = {
    ...echoRowToMessage(labeled ?? row),
    systemMessage: true,
  };

  if (io) {
    broadcastToEchoChannel(io, welcomeChannelId, 'message', messageForClients);
  }
}
