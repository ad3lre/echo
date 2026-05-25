import type { FastifyBaseLogger } from 'fastify';
import type { Server } from 'socket.io';
import type pg from 'pg';
import type { Message } from '../../../shared/types';
import { config } from '../config';
import {
  ECHO_DISCORD_BRIDGE_SYNC_NOTICE_BRIDGE_SOURCE,
  ECHO_INTERNAL_SYSTEM_ACTOR_USER_ID,
} from '../domain/echoChannelWebhookConstants';
import { normalizeDiscordWebhookUrl } from '../domain/discordBridgeRepo';
import {
  attachAuthorLabelsToEchoMessageRows,
  getEchoMessageById,
  insertEchoMessage,
} from '../domain/echoMessagesDal';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import { echoMessagesPersistedTotal } from '../observability/echoMetrics';
import { broadcastToEchoChannel } from '../sockets/channelBroadcast';
import { echoRowToMessage } from './echoPersistedMessageCreate';
import { discordBotPostChannelMessage } from './integrations/discordApiClient';

const DISCORD_POST_TIMEOUT_MS = 12_000;

/** Compact key for enabled bridge directions (`''` = fully off). */
export function discordBridgeSyncStateKey(
  inboundEnabled: boolean,
  outboundEnabled: boolean,
): string {
  if (!inboundEnabled && !outboundEnabled) return '';
  return `${inboundEnabled ? 'i' : ''}${outboundEnabled ? 'o' : ''}`;
}

export function formatDiscordBridgeSyncNoticeContent(
  inboundEnabled: boolean,
  outboundEnabled: boolean,
): string {
  if (inboundEnabled && outboundEnabled) {
    return 'Discord chat sync was enabled for this channel (messages flow both ways).';
  }
  if (inboundEnabled) {
    return 'Discord chat sync was enabled for this channel (Discord → Echo).';
  }
  if (outboundEnabled) {
    return 'Discord chat sync was enabled for this channel (Echo → Discord).';
  }
  return '';
}

function bridgeSyncDirectionCount(stateKey: string): number {
  let count = 0;
  if (stateKey.includes('i')) count += 1;
  if (stateKey.includes('o')) count += 1;
  return count;
}

export function shouldPostDiscordBridgeSyncNotice(
  previousInbound: boolean,
  previousOutbound: boolean,
  nextInbound: boolean,
  nextOutbound: boolean,
): boolean {
  const prev = discordBridgeSyncStateKey(previousInbound, previousOutbound);
  const next = discordBridgeSyncStateKey(nextInbound, nextOutbound);
  if (!next || next === prev) return false;
  return bridgeSyncDirectionCount(next) > bridgeSyncDirectionCount(prev);
}

async function postDiscordBridgeSyncNoticeToDiscord(
  log: FastifyBaseLogger,
  content: string,
  discordChannelId: string,
  webhookUrl: string | null,
): Promise<void> {
  const text = content.slice(0, 2000);
  const url = webhookUrl ? normalizeDiscordWebhookUrl(webhookUrl) : null;
  if (url) {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'discord.com' && host !== 'canary.discord.com') return;
    try {
      const res = await fetch(`${url}?wait=true`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: text, username: 'Echo' }),
        signal: AbortSignal.timeout(DISCORD_POST_TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        log.warn(
          {
            msg: 'discord_bridge.sync_notice_webhook_failed',
            status: res.status,
            body: body.slice(0, 500),
          },
          'Discord bridge sync notice webhook failed',
        );
      }
      return;
    } catch (e) {
      log.warn(
        { err: e, msg: 'discord_bridge.sync_notice_webhook_fetch_failed' },
        'Discord bridge sync notice webhook request failed',
      );
    }
  }

  const botToken = config.discordBotToken.trim();
  if (!botToken) {
    log.warn(
      { msg: 'discord_bridge.sync_notice_no_discord_transport' },
      'Skipped Discord sync notice (no webhook URL or bot token)',
    );
    return;
  }

  const ok = await discordBotPostChannelMessage(
    botToken,
    discordChannelId,
    text,
  );
  if (!ok) {
    log.warn(
      { msg: 'discord_bridge.sync_notice_bot_post_failed', discordChannelId },
      'Discord bridge sync notice bot post failed',
    );
  }
}

/**
 * Posts a centered system message in Echo and a plain notice in Discord when
 * bridge sync directions change to a newly active combination.
 */
export async function postDiscordBridgeSyncNotice(
  pool: pg.Pool,
  io: Server | undefined,
  log: FastifyBaseLogger,
  input: {
    echoChannelId: string;
    discordChannelId: string;
    inboundEnabled: boolean;
    outboundEnabled: boolean;
    discordWebhookUrl: string | null;
  },
): Promise<void> {
  const content = formatDiscordBridgeSyncNoticeContent(
    input.inboundEnabled,
    input.outboundEnabled,
  );
  if (!content.trim()) return;

  const messageId = nextEchoSnowflakeId();
  try {
    const ins = await insertEchoMessage(pool, {
      id: messageId,
      channelId: input.echoChannelId,
      authorId: ECHO_INTERNAL_SYSTEM_ACTOR_USER_ID,
      content,
      searchIndexText: content,
      messageFormatVersion: 1,
      contentSchemaVersion: 1,
      systemMessage: true,
      bridgeSource: ECHO_DISCORD_BRIDGE_SYNC_NOTICE_BRIDGE_SOURCE,
    });
    if (ins !== 'inserted') return;
  } catch (e) {
    log.warn(
      { err: e, msg: 'discord_bridge.sync_notice_insert_failed' },
      'Discord bridge sync notice insert failed',
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
    broadcastToEchoChannel(
      io,
      input.echoChannelId,
      'message',
      messageForClients,
    );
  }

  const dChannelId = input.discordChannelId.trim();
  if (!dChannelId) return;

  await postDiscordBridgeSyncNoticeToDiscord(
    log,
    content,
    dChannelId,
    input.discordWebhookUrl,
  );
}
