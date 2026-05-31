import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import type { Message } from '../../../shared/types';
import { ECHO_DISCORD_BRIDGE_SYNC_NOTICE_BRIDGE_SOURCE } from '../domain/echoChannelWebhookConstants';
import {
  getDiscordBridgeForEchoChannel,
  normalizeDiscordWebhookUrl,
} from '../domain/discordBridgeRepo';

const OUTBOUND_TIMEOUT_MS = 12_000;

/**
 * Post Echo message to Discord via channel incoming webhook (username + avatar_url).
 */
export async function mirrorEchoMessageToDiscordIfConfigured(
  pool: pg.Pool,
  log: FastifyBaseLogger,
  channelId: string,
  message: Message,
): Promise<void> {
  const bridge = await getDiscordBridgeForEchoChannel(pool, channelId);
  if (!bridge?.outboundEnabled || !bridge.discordWebhookUrl) return;
  if (message.bridgeSource === 'echo_webhook') return;
  if (message.bridgeSource === ECHO_DISCORD_BRIDGE_SYNC_NOTICE_BRIDGE_SOURCE) {
    return;
  }

  const url = normalizeDiscordWebhookUrl(bridge.discordWebhookUrl);
  if (!url) {
    log.warn(
      { channelId, msg: 'discord_bridge.invalid_webhook_url' },
      'Invalid Discord webhook URL for bridge',
    );
    return;
  }

  const username =
    message.authorDisplayName?.trim().slice(0, 80) || 'Echo user';
  const avatarUrl = message.authorAvatar?.trim().slice(0, 2048);
  let text = (message.content ?? '').slice(0, 2000);
  if (!text.trim() && message.attachments?.length) {
    text = message.attachments
      .map((a) => a.url)
      .join('\n')
      .slice(0, 2000);
  }
  if (!text.trim()) {
    return;
  }

  const body: Record<string, unknown> = {
    content: text,
    username,
    allowed_mentions: { parse: [] as string[] },
  };
  if (avatarUrl) body.avatar_url = avatarUrl;

  try {
    const res = await fetch(`${url}?wait=true`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      log.warn(
        {
          msg: 'discord_bridge.webhook_http_error',
          status: res.status,
          body: t.slice(0, 500),
        },
        'Discord webhook execute failed',
      );
    }
  } catch (e) {
    log.warn(
      { err: e, msg: 'discord_bridge.webhook_fetch_failed' },
      'Discord webhook request failed',
    );
  }
}
