import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import type { Message, Embed } from '../../../shared/types';
import { ECHO_DISCORD_BRIDGE_SYNC_NOTICE_BRIDGE_SOURCE } from '../domain/echoChannelWebhookConstants';
import {
  getDiscordBridgeForEchoChannel,
  normalizeDiscordWebhookUrl,
} from '../domain/discordBridgeRepo';

const OUTBOUND_TIMEOUT_MS = 12_000;
const OUTBOUND_MAX_ATTEMPTS = 3;
const OUTBOUND_RETRY_BASE_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapEchoEmbedsForDiscord(
  embeds: Embed[] | undefined,
): Record<string, unknown>[] {
  if (!embeds?.length) return [];
  return embeds.slice(0, 8).map((e) => {
    const out: Record<string, unknown> = {};
    if (e.title) out.title = String(e.title).slice(0, 256);
    if (e.description) out.description = String(e.description).slice(0, 4096);
    if (e.url) out.url = String(e.url).slice(0, 2048);
    if (e.color != null) out.color = e.color;
    if (e.image?.url) out.image = { url: String(e.image.url).slice(0, 2048) };
    if (e.thumbnail?.url) {
      out.thumbnail = { url: String(e.thumbnail.url).slice(0, 2048) };
    }
    if (e.footer?.text) {
      out.footer = { text: String(e.footer.text).slice(0, 2048) };
    }
    return out;
  });
}

function buildOutboundWebhookBody(
  message: Message,
): Record<string, unknown> | null {
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
  const embeds = mapEchoEmbedsForDiscord(message.embeds);
  if (!text.trim() && !embeds.length && !message.stickers?.length) {
    return null;
  }
  if (!text.trim() && message.stickers?.length) {
    text = message.stickers
      .map((s) => `:${s.name}:`)
      .join(' ')
      .slice(0, 2000);
  }

  const body: Record<string, unknown> = {
    content: text || undefined,
    username,
    allowed_mentions: { parse: [] as string[] },
  };
  if (avatarUrl) body.avatar_url = avatarUrl;
  if (embeds.length) body.embeds = embeds;
  return body;
}

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

  const body = buildOutboundWebhookBody(message);
  if (!body) return;

  for (let attempt = 1; attempt <= OUTBOUND_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${url}?wait=true`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
      });
      if (res.ok) return;
      const t = await res.text().catch(() => '');
      const retryable = res.status >= 500 || res.status === 429;
      log.warn(
        {
          msg: 'discord_bridge.webhook_http_error',
          status: res.status,
          attempt,
          body: t.slice(0, 500),
        },
        'Discord webhook execute failed',
      );
      if (!retryable || attempt >= OUTBOUND_MAX_ATTEMPTS) return;
    } catch (e) {
      log.warn(
        { err: e, msg: 'discord_bridge.webhook_fetch_failed', attempt },
        'Discord webhook request failed',
      );
      if (attempt >= OUTBOUND_MAX_ATTEMPTS) return;
    }
    await sleep(OUTBOUND_RETRY_BASE_MS * attempt);
  }
}
