import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import type { Message } from '../../../shared/types';
import { isImageSlotFilled } from '../../../shared/imageSlot';
import { walkImageSlots } from '../../../shared/imageSlotContentJson';
import { mapEchoEmbedsToDiscordApi } from '../../../shared/discordEmbedApi';
import { ECHO_DISCORD_BRIDGE_SYNC_NOTICE_BRIDGE_SOURCE } from '../domain/echoChannelWebhookConstants';
import {
  getDiscordBridgeForEchoChannel,
  normalizeDiscordWebhookUrl,
} from '../domain/discordBridgeRepo';
import { sanitizeWebhookAvatarUrl } from './webhookMediaUrl';

const OUTBOUND_TIMEOUT_MS = 12_000;
const OUTBOUND_MAX_ATTEMPTS = 3;
const OUTBOUND_RETRY_BASE_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exported for unit tests — builds the Discord incoming-webhook JSON body. */
export function buildDiscordBridgeOutboundWebhookBody(
  message: Message,
): Record<string, unknown> | null {
  const username =
    message.authorDisplayName?.trim().slice(0, 80) || 'Echo user';
  // Native Echo users often have `data:image/svg+xml` default pfps. Discord
  // webhooks reject non-HTTP(S) avatar_url values with 400 and drop the post.
  const avatarUrl = sanitizeWebhookAvatarUrl(message.authorAvatar);
  let text = (message.contentText ?? message.content ?? '').slice(0, 2000);
  const filledSlotUrls = walkImageSlots(message.contentJson)
    .filter((slot) => isImageSlotFilled(slot))
    .map((slot) => String(slot.imageUrl ?? '').trim())
    .filter((url) => url.length > 0);
  if (filledSlotUrls.length) {
    const slotLine = filledSlotUrls.join('\n');
    text = text.trim() ? `${text.trim()}\n${slotLine}` : slotLine;
    text = text.slice(0, 2000);
  }
  if (!text.trim() && message.attachments?.length) {
    text = message.attachments
      .map((a) => a.url)
      .join('\n')
      .slice(0, 2000);
  }
  const embeds = mapEchoEmbedsToDiscordApi(message.embeds);
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

async function postDiscordBridgeWebhook(
  url: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${url}?wait=true`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
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

  const body = buildDiscordBridgeOutboundWebhookBody(message);
  if (!body) return;

  for (let attempt = 1; attempt <= OUTBOUND_MAX_ATTEMPTS; attempt++) {
    try {
      let res = await postDiscordBridgeWebhook(url, body);
      if (!res.ok && res.status === 400 && body.avatar_url) {
        const { avatar_url: _drop, ...withoutAvatar } = body;
        res = await postDiscordBridgeWebhook(url, withoutAvatar);
      }
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
