import type { Client, Message, PartialMessage } from 'discord.js';
import { StickerFormatType } from 'discord.js';
import {
  getEchoWebhookJson,
  noteAllowlistRefresh,
  postEchoWebhookJson,
} from './echoApi.js';
import { sleep } from './util/rateLimitQueue.js';
import { parseMinInteger } from './util/numberParsing.js';

let cachedAllowlist: Set<string> = new Set();
let allowlistGuildByChannel = new Map<string, string>();
let allowlistReadyResolve: (() => void) | null = null;
const allowlistReady = new Promise<void>((resolve) => {
  allowlistReadyResolve = resolve;
});

function serializeAuthor(m: Message): Record<string, unknown> {
  const a = m.author;
  return {
    id: a.id,
    username: a.username,
    global_name: a.globalName ?? a.username,
    avatar: a.avatar,
  };
}

function serializeAttachments(m: Message): unknown {
  return [...m.attachments.values()].map((a) => ({
    url: (a.url || a.proxyURL || '').trim(),
    filename: a.name,
    contentType: a.contentType ?? undefined,
  }));
}

function mapStickerFormat(
  f: StickerFormatType,
): 'png' | 'apng' | 'gif' | 'lottie' {
  switch (f) {
    case StickerFormatType.PNG:
      return 'png';
    case StickerFormatType.APNG:
      return 'apng';
    case StickerFormatType.Lottie:
      return 'lottie';
    case StickerFormatType.GIF:
      return 'gif';
    default:
      return 'png';
  }
}

function buildInboundBody(
  m: Message,
  guildId: string | null | undefined,
  event: 'create' | 'update' | 'delete',
): Record<string, unknown> {
  if (event === 'delete') {
    return {
      event: 'delete',
      discordGuildId: guildId,
      discordChannelId: m.channelId,
      discordMessageId: m.id,
    };
  }
  const stickerPayload = [...m.stickers.values()].map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    format: mapStickerFormat(s.format),
  }));
  const ref = m.reference;
  return {
    event: event === 'update' ? 'update' : undefined,
    discordGuildId: allowlistGuildByChannel.get(m.channelId) ?? guildId,
    discordChannelId: m.channelId,
    discordMessageId: m.id,
    timestamp: m.createdAt.toISOString(),
    content: m.content,
    author: serializeAuthor(m),
    attachments: serializeAttachments(m),
    ...(stickerPayload.length ? { stickers: stickerPayload } : {}),
    embeds: m.embeds.slice(0, 8).map((e) => e.toJSON()),
    ...(ref?.messageId
      ? {
          messageReference: {
            messageId: ref.messageId,
            channelId: ref.channelId ?? m.channelId,
          },
        }
      : {}),
    webhookId: m.webhookId,
  };
}

async function forwardToEcho(
  m: Message,
  event: 'create' | 'update' | 'delete' = 'create',
): Promise<void> {
  await allowlistReady;
  const guildId = allowlistGuildByChannel.get(m.channelId) ?? m.guildId;
  const body = buildInboundBody(m, guildId, event);
  await postEchoWebhookJson(
    '/api/v1/hooks/discord-bridge/inbound',
    body,
    'bridge',
  );
}

async function backfillChannel(
  client: Client,
  channelId: string,
): Promise<void> {
  try {
    const ch = await client.channels.fetch(channelId);
    if (!ch || !ch.isTextBased() || ch.isDMBased()) return;
    const fetched = await ch.messages.fetch({ limit: 25 });
    const sorted = [...fetched.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp,
    );
    for (const m of sorted) {
      if (!m.guild || m.author.bot) continue;
      await forwardToEcho(m, 'create');
      await sleep(150);
    }
  } catch (e) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        relay: 'bridge',
        msg: 'backfill_failed',
        channelId,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }
}

async function refreshAllowlist(client: Client): Promise<void> {
  const body = await getEchoWebhookJson<{ channels?: unknown }>(
    '/api/v1/hooks/discord-bridge/allowlist',
    'bridge',
  );
  if (!body) {
    noteAllowlistRefresh(false, cachedAllowlist.size);
    if (allowlistReadyResolve) {
      allowlistReadyResolve();
      allowlistReadyResolve = null;
    }
    return;
  }
  const chans = body.channels;
  if (!Array.isArray(chans)) {
    noteAllowlistRefresh(false, cachedAllowlist.size);
    if (allowlistReadyResolve) {
      allowlistReadyResolve();
      allowlistReadyResolve = null;
    }
    return;
  }
  const next = new Set<string>();
  const guildMap = new Map<string, string>();
  for (const item of chans) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const gid =
      typeof o.discordGuildId === 'string' ? o.discordGuildId.trim() : '';
    const cid =
      typeof o.discordChannelId === 'string' ? o.discordChannelId.trim() : '';
    if (gid && cid) {
      next.add(cid);
      guildMap.set(cid, gid);
    }
  }
  const added: string[] = [];
  for (const cid of next) {
    if (!cachedAllowlist.has(cid)) added.push(cid);
  }
  cachedAllowlist = next;
  allowlistGuildByChannel = guildMap;
  noteAllowlistRefresh(true, next.size);
  if (allowlistReadyResolve) {
    allowlistReadyResolve();
    allowlistReadyResolve = null;
  }
  for (const cid of added) {
    void backfillChannel(client, cid);
  }
}

function shouldRelay(m: Message | PartialMessage): m is Message {
  return Boolean(m.guild && m.author && !m.author.bot && m.partial === false);
}

/**
 * Poll Echo for bridged Discord channel ids and forward GuildMessages to the API.
 */
export function startDiscordBridgeRelay(client: Client): void {
  const pollMs = parseMinInteger(
    process.env.ECHO_DISCORD_BRIDGE_POLL_MS,
    30_000,
    5_000,
  );
  void refreshAllowlist(client);
  setInterval(() => void refreshAllowlist(client), pollMs);

  client.on('messageCreate', (m: Message) => {
    if (!shouldRelay(m)) return;
    if (!cachedAllowlist.has(m.channelId)) return;
    void forwardToEcho(m, 'create').catch((e) =>
      console.warn('[bridge] forward failed', e),
    );
  });

  client.on('messageUpdate', (_old, m) => {
    if (!m.guild || m.author?.bot) return;
    if (!cachedAllowlist.has(m.channelId)) return;
    void (async () => {
      const full = m.partial ? await m.fetch().catch(() => null) : m;
      if (!full || !full.author || full.author.bot) return;
      await forwardToEcho(full, 'update');
    })().catch((e) => console.warn('[bridge] update failed', e));
  });

  client.on('messageDelete', (m) => {
    if (!m.guild || !cachedAllowlist.has(m.channelId)) return;
    const guildId = allowlistGuildByChannel.get(m.channelId) ?? m.guild.id;
    void postEchoWebhookJson(
      '/api/v1/hooks/discord-bridge/inbound',
      {
        event: 'delete',
        discordGuildId: guildId,
        discordChannelId: m.channelId,
        discordMessageId: m.id,
      },
      'bridge',
    ).catch((e) => console.warn('[bridge] delete failed', e));
  });
}
