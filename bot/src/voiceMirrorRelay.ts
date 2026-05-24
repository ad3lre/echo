import { ChannelType, type Client, type VoiceState } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { fetchEchoWebhook } from './echoFetch.js';

let cachedWatchGuildIds = new Set<string>();

/** Previous non-empty voice channel ids per guild — used to emit empty snapshots when the last user leaves. */
const prevVoiceChannelIdsByGuild = new Map<string, Set<string>>();

const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

async function refreshWatchlist(client: Client): Promise<void> {
  const secret = process.env.ECHO_DISCORD_BOT_WEBHOOK_SECRET?.trim();
  if (!secret) return;
  const url = `${echoApiBaseUrl()}/api/v1/hooks/discord-voice-mirror/watchlist`;
  try {
    const res = await fetchEchoWebhook(url, {
      method: 'GET',
      headers: { 'x-echo-discord-bot-secret': secret },
    });
    if (!res.ok) return;
    const body = (await res.json()) as { guildIds?: unknown };
    const ids = body.guildIds;
    if (!Array.isArray(ids)) return;
    const next = new Set<string>();
    for (const id of ids) {
      if (typeof id === 'string' && /^\d{10,25}$/.test(id.trim())) {
        next.add(id.trim());
      }
    }
    const previous = cachedWatchGuildIds;
    cachedWatchGuildIds = next;
    /**
     * Snapshots were only sent on `voiceStateUpdate`. After enabling mirror or
     * restarting the bot, Echo stayed empty until someone joined/left Discord VC.
     * Only bootstrap newly watched guilds — not the full watchlist every poll tick.
     */
    const bootstrapAll = previous.size === 0 && next.size > 0;
    for (const guildId of next) {
      if (bootstrapAll || !previous.has(guildId)) {
        scheduleGuildFlush(client, guildId);
      }
    }
  } catch {
    /* ignore */
  }
}

async function postVoiceSnapshot(
  client: Client,
  guildId: string,
): Promise<void> {
  const secret = process.env.ECHO_DISCORD_BOT_WEBHOOK_SECRET?.trim();
  if (!secret) return;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const groups = new Map<string, VoiceState[]>();
  for (const vs of guild.voiceStates.cache.values()) {
    const cid = vs.channelId;
    if (!cid) continue;
    if (!groups.has(cid)) groups.set(cid, []);
    groups.get(cid)!.push(vs);
  }
  const currentActive = new Set<string>();
  for (const [cid, states] of groups) {
    if (states.length > 0) currentActive.add(cid);
  }

  const prev = prevVoiceChannelIdsByGuild.get(guildId) ?? new Set<string>();
  const union = new Set<string>([...prev, ...currentActive]);

  const channels: {
    discordChannelId: string;
    discordParentCategoryId: string | null;
    name: string;
    members: {
      id: string;
      username: string;
      globalName?: string;
      avatar?: string | null;
    }[];
  }[] = [];

  for (const channelId of union) {
    const states = groups.get(channelId) ?? [];
    const ch = guild.channels.cache.get(channelId);
    if (!ch) continue;
    if (
      ch.type !== ChannelType.GuildVoice &&
      ch.type !== ChannelType.GuildStageVoice
    ) {
      continue;
    }
    const members: {
      id: string;
      username: string;
      globalName?: string;
      avatar?: string | null;
    }[] = [];
    for (const vs of states) {
      const m = vs.member;
      if (!m) continue;
      members.push({
        id: m.user.id,
        username: m.user.username,
        ...(m.user.globalName ? { globalName: m.user.globalName } : {}),
        avatar: m.user.avatarURL({ size: 64, extension: 'png' }),
      });
    }
    channels.push({
      discordChannelId: channelId,
      discordParentCategoryId: ch.parentId,
      name: ch.name,
      members,
    });
  }

  prevVoiceChannelIdsByGuild.set(guildId, currentActive);

  const url = `${echoApiBaseUrl()}/api/v1/hooks/discord-voice-mirror/snapshot`;
  const deliveryId = randomUUID();
  const res = await fetchEchoWebhook(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-echo-discord-bot-secret': secret,
      'x-echo-delivery-id': deliveryId,
    },
    body: JSON.stringify({
      discordGuildId: guildId,
      channels,
    }),
  });
  if (!res.ok && res.status !== 204) {
    const t = await res.text().catch(() => '');
    console.warn(
      `[voice-mirror] snapshot HTTP ${res.status} for guild ${guildId}: ${t.slice(0, 200)}`,
    );
  }
}

function scheduleGuildFlush(client: Client, guildId: string): void {
  const existing = flushTimers.get(guildId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    flushTimers.delete(guildId);
    void postVoiceSnapshot(client, guildId).catch((e) =>
      console.warn('[voice-mirror] snapshot failed', e),
    );
  }, 450);
  flushTimers.set(guildId, t);
}

/**
 * Poll Echo for guilds with voice mirror enabled; debounce-post voice snapshots on updates.
 */
export function startDiscordVoiceMirrorRelay(client: Client): void {
  const pollRaw = process.env.ECHO_DISCORD_VOICE_MIRROR_POLL_MS?.trim();
  const pollMs =
    pollRaw === undefined || pollRaw === ''
      ? 30_000
      : Math.max(5_000, Number(pollRaw));
  void refreshWatchlist(client);
  if (Number.isFinite(pollMs) && pollMs > 0) {
    setInterval(() => void refreshWatchlist(client), pollMs);
  }

  client.on('voiceStateUpdate', (_old: VoiceState, vs: VoiceState) => {
    const guildId = vs.guild?.id;
    if (!guildId || !cachedWatchGuildIds.has(guildId)) return;
    scheduleGuildFlush(client, guildId);
  });
}
