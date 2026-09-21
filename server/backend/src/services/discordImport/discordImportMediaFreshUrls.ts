import type pg from 'pg';
import { DISCORD_BOT_INTERNAL_FETCH_MS } from '../../constants/outboundHttp';
import { config } from '../../config';
import {
  discordCdnUrlStableKey,
  pickDiscordUrlOrProxy,
} from '../../domain/discord/discordCdnUrls';

type BotMessage = {
  id?: unknown;
  attachments?: unknown;
  stickers?: unknown;
  embeds?: unknown;
  forwardedFrom?: unknown;
};

function addUrl(index: Map<string, string>, raw: unknown): void {
  if (typeof raw !== 'string' || !raw.trim()) return;
  const url = raw.trim();
  const key = discordCdnUrlStableKey(url);
  if (key) index.set(key, url);
}

function addUrlObject(index: Map<string, string>, raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const url = pickDiscordUrlOrProxy(raw as Record<string, unknown>);
  if (url) addUrl(index, url);
}

function addIconObject(index: Map<string, string>, raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const url = pickDiscordUrlOrProxy(raw as Record<string, unknown>, [
    'icon_url',
    'proxy_icon_url',
  ]);
  if (url) addUrl(index, url);
}

function collectMessageUrls(message: BotMessage): Map<string, string> {
  const index = new Map<string, string>();
  if (Array.isArray(message.attachments)) {
    for (const attachment of message.attachments) {
      addUrlObject(index, attachment);
    }
  }
  if (Array.isArray(message.stickers)) {
    for (const sticker of message.stickers) addUrlObject(index, sticker);
  }
  if (Array.isArray(message.embeds)) {
    for (const raw of message.embeds) {
      if (!raw || typeof raw !== 'object') continue;
      const embed = raw as Record<string, unknown>;
      addUrlObject(index, embed.image);
      addUrlObject(index, embed.video);
      addUrlObject(index, embed.thumbnail);
      addIconObject(index, embed.footer);
      addIconObject(index, embed.author);
    }
  }
  if (message.forwardedFrom && typeof message.forwardedFrom === 'object') {
    addUrl(
      index,
      (message.forwardedFrom as { authorAvatar?: unknown }).authorAvatar,
    );
  }
  return index;
}

/**
 * Fetch fresh signed Discord URLs for one imported/bridged Echo message.
 * Returns an empty map when the bot cannot identify the source channel/message.
 */
export async function fetchFreshDiscordMediaUrlsForMessage(
  pool: pg.Pool,
  echoChannelId: string,
  messageId: string,
): Promise<Map<string, string>> {
  const source = await pool.query<{ discord_channel_id: string }>(
    `SELECT discord_channel_id
     FROM echo_discord_channel_message_imports
     WHERE channel_id = $1
     UNION ALL
     SELECT discord_channel_id
     FROM echo_discord_channel_bridges
     WHERE channel_id = $1
       AND (inbound_enabled = true OR outbound_enabled = true)
     LIMIT 1`,
    [echoChannelId],
  );
  const discordChannelId = source.rows[0]?.discord_channel_id?.trim();
  if (!discordChannelId) return new Map();

  const botPort = process.env.ECHO_DISCORD_BOT_INTERNAL_PORT || '3005';
  const botUrl = `http://localhost:${botPort}/channels/${discordChannelId}/messages?limit=100`;
  const response = await fetch(botUrl, {
    signal: AbortSignal.timeout(DISCORD_BOT_INTERNAL_FETCH_MS),
    headers: {
      'x-echo-discord-bot-secret': config.echoDiscordBotWebhookSecret,
    },
  });
  if (!response.ok) return new Map();

  const body = (await response.json()) as { messages?: unknown };
  if (!Array.isArray(body.messages)) return new Map();
  const message = body.messages.find((raw): raw is BotMessage => {
    if (!raw || typeof raw !== 'object') return false;
    return String((raw as BotMessage).id ?? '').trim() === messageId.trim();
  });
  return message ? collectMessageUrls(message) : new Map();
}

export function freshDiscordMediaUrlForStableKey(
  freshByStableKey: Map<string, string>,
  staleUrl: string,
): string | null {
  const key = discordCdnUrlStableKey(staleUrl);
  return key ? (freshByStableKey.get(key) ?? null) : null;
}
