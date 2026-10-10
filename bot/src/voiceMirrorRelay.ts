import { ChannelType, type Client, type VoiceState } from 'discord.js';
import { getEchoWebhookJson, postEchoWebhookJson } from './echoApi.js';
import { parseMinInteger } from './util/numberParsing.js';
import { createVoiceSnapshotScheduler } from './voiceSnapshotScheduler.js';

let cachedWatchGuildIds = new Set<string>();

// Retain delivered channel IDs until their empty snapshots are acknowledged.
const prevVoiceChannelIdsByGuild = new Map<string, Set<string>>();

const scheduleGuildFlush = createVoiceSnapshotScheduler(
  postVoiceSnapshot,
  (id) => cachedWatchGuildIds.has(id),
);

async function refreshWatchlist(client: Client): Promise<void> {
  const body = await getEchoWebhookJson<{ guildIds?: unknown }>(
    '/api/v1/hooks/discord-voice-mirror/watchlist',
    'voice-mirror',
  );
  if (!body) return;
  const ids = body.guildIds;
  if (!Array.isArray(ids)) return;
  const next = new Set<string>();
  for (const id of ids) {
    if (typeof id === 'string' && /^\d{10,25}$/.test(id.trim())) {
      next.add(id.trim());
    }
  }
  cachedWatchGuildIds = next;
  for (const guildId of next) {
    scheduleGuildFlush(client, guildId);
  }
}

async function postVoiceSnapshot(
  client: Client,
  guildId: string,
): Promise<void> {
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

  const response = await postEchoWebhookJson(
    '/api/v1/hooks/discord-voice-mirror/snapshot',
    { discordGuildId: guildId, channels },
    'voice-mirror',
  );
  if (!response?.ok) throw new Error('Voice snapshot was not accepted');
  prevVoiceChannelIdsByGuild.set(guildId, currentActive);
}

/** Reconcile watched guilds periodically and debounce voice updates. */
export function startDiscordVoiceMirrorRelay(client: Client): void {
  const pollMs = parseMinInteger(
    process.env.ECHO_DISCORD_VOICE_MIRROR_POLL_MS,
    30_000,
    5_000,
  );
  void refreshWatchlist(client);
  setInterval(() => void refreshWatchlist(client), pollMs);

  client.on('voiceStateUpdate', (_old: VoiceState, vs: VoiceState) => {
    const guildId = vs.guild?.id;
    if (!guildId || !cachedWatchGuildIds.has(guildId)) return;
    scheduleGuildFlush(client, guildId);
  });
}
