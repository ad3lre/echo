import { randomUUID } from 'node:crypto';
import type { Client, Message } from 'discord.js';
import { StickerFormatType } from 'discord.js';
import { fetchEchoWebhook } from './echoFetch.js';

let cachedAllowlist: Set<string> = new Set();
let allowlistGuildByChannel = new Map<string, string>();

function echoApiBaseUrl(): string {
  const raw = process.env.ECHO_API_BASE_URL?.trim();
  if (raw) return raw.replace(/\/$/, '');
  const hook = process.env.ECHO_DISCORD_BOT_WEBHOOK_URL?.trim();
  if (hook) {
    try {
      const u = new URL(hook);
      return u.origin;
    } catch {
      /* fall through */
    }
  }
  return 'http://127.0.0.1:3000';
}

async function refreshAllowlist(): Promise<void> {
  const secret = process.env.ECHO_DISCORD_BOT_WEBHOOK_SECRET?.trim();
  if (!secret) return;
  const url = `${echoApiBaseUrl()}/api/v1/hooks/discord-bridge/allowlist`;
  try {
    const res = await fetchEchoWebhook(url, {
      method: 'GET',
      headers: { 'x-echo-discord-bot-secret': secret },
    });
    if (!res.ok) return;
    const body = (await res.json()) as { channels?: unknown };
    const chans = body.channels;
    if (!Array.isArray(chans)) return;
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
    cachedAllowlist = next;
    allowlistGuildByChannel = guildMap;
  } catch (e) {
    console.warn(
      '[bridge] allowlist refresh failed — inbound sync disabled until this succeeds:',
      e,
    );
  }
}

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
    url: a.url,
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

async function forwardToEcho(m: Message): Promise<void> {
  const secret = process.env.ECHO_DISCORD_BOT_WEBHOOK_SECRET?.trim();
  if (!secret) return;
  const url = `${echoApiBaseUrl()}/api/v1/hooks/discord-bridge/inbound`;
  const guildId = allowlistGuildByChannel.get(m.channelId) ?? m.guildId;
  const stickerPayload = [...m.stickers.values()].map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    format: mapStickerFormat(s.format),
  }));
  const body = {
    discordGuildId: guildId,
    discordChannelId: m.channelId,
    discordMessageId: m.id,
    timestamp: m.createdAt.toISOString(),
    content: m.content,
    author: serializeAuthor(m),
    attachments: serializeAttachments(m),
    ...(stickerPayload.length ? { stickers: stickerPayload } : {}),
    embeds: m.embeds.slice(0, 8).map((e) => e.toJSON()),
    webhookId: m.webhookId,
  };
  const res = await fetchEchoWebhook(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-echo-discord-bot-secret': secret,
      /** Required by Echo replay guard (`discordBridgeHook.ts`). */
      'x-echo-delivery-id': randomUUID(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 204) {
    const t = await res.text().catch(() => '');
    console.warn(
      `[bridge] inbound HTTP ${res.status} for msg ${m.id}: ${t.slice(0, 200)}`,
    );
  }
}

/**
 * Poll Echo for bridged Discord channel ids and forward GuildMessages to the API.
 */
export function startDiscordBridgeRelay(client: Client): void {
  const pollRaw = process.env.ECHO_DISCORD_BRIDGE_POLL_MS?.trim();
  const pollMs =
    pollRaw === undefined || pollRaw === ''
      ? 30_000
      : Math.max(5_000, Number(pollRaw));
  void refreshAllowlist();
  if (Number.isFinite(pollMs) && pollMs > 0) {
    setInterval(() => void refreshAllowlist(), pollMs);
  }

  client.on('messageCreate', (m: Message) => {
    if (!m.guild || m.author.bot) return;
    if (!cachedAllowlist.has(m.channelId)) return;
    void forwardToEcho(m).catch((e) =>
      console.warn('[bridge] forward failed', e),
    );
  });
}
