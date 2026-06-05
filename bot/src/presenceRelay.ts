import { type Client, type Guild, type GuildMember } from 'discord.js';
import { getEchoWebhookJson, postEchoWebhookJson } from './echoApi.js';
import { parseMinInteger } from './util/numberParsing.js';

/** Batch size for presence queries — conservative to stay well under Discord API limits. */
const DEFAULT_BATCH_SIZE = 50;

/** Default poll interval between full cycles (1 minute). */
const DEFAULT_POLL_INTERVAL_MS = 60_000;

/** Minimum time before re-checking the same user. */
const MIN_USER_RECHECK_MS = 45_000;

interface PresenceSnapshot {
  discordUserId: string;
  discordUsername: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  activities: Array<{
    name: string;
    type: number;
    details?: string;
    state?: string;
  }>;
  isOnline: boolean;
}

interface GuildPresenceBatch {
  discordGuildId: string;
  guildName: string;
  snapshotAt: number;
  presences: PresenceSnapshot[];
}

const lastUserCheck = new Map<string, number>();
const guildCheckQueues = new Map<string, string[]>();
const guildBatchIndices = new Map<string, number>();

function getNextBatch(guild: Guild, batchSize: number): GuildMember[] {
  const now = Date.now();
  const guildId = guild.id;

  let queue = guildCheckQueues.get(guildId);
  if (!queue || queue.length === 0) {
    queue = [...guild.members.cache.keys()];
    guildCheckQueues.set(guildId, queue);
    guildBatchIndices.set(guildId, 0);
  }

  const batchIndex = guildBatchIndices.get(guildId) ?? 0;
  const startIdx = (batchIndex * batchSize) % queue.length;

  const batch: GuildMember[] = [];
  let checked = 0;
  let idx = startIdx;

  while (checked < queue.length && batch.length < batchSize) {
    const memberId = queue[idx % queue.length];
    const member = guild.members.cache.get(memberId);
    const lastCheck = lastUserCheck.get(memberId) ?? 0;

    if (member && now - lastCheck >= MIN_USER_RECHECK_MS) {
      batch.push(member);
      lastUserCheck.set(memberId, now);
    }

    checked++;
    idx++;

    if (idx >= startIdx + queue.length) break;
  }

  const nextIndex = (batchIndex + 1) % Math.ceil(queue.length / batchSize || 1);
  guildBatchIndices.set(guildId, nextIndex);

  return batch;
}

function buildPresenceSnapshot(member: GuildMember): PresenceSnapshot {
  const activities =
    member.presence?.activities.map((a) => ({
      name: a.name,
      type: a.type as number,
      details: a.details ?? undefined,
      state: a.state ?? undefined,
    })) ?? [];

  const status = (member.presence?.status ??
    'offline') as PresenceSnapshot['status'];

  return {
    discordUserId: member.user.id,
    discordUsername: member.user.username,
    status,
    activities,
    isOnline: status !== 'offline',
  };
}

async function postPresenceBatch(batch: GuildPresenceBatch): Promise<void> {
  await postEchoWebhookJson(
    '/api/v1/hooks/discord-presence/snapshot',
    batch,
    'presence',
  );
}

async function pollGuildPresence(
  client: Client,
  guildId: string,
): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  try {
    if (guild.members.cache.size === 0) {
      await guild.members.fetch({ limit: 1000, withPresences: true });
    }

    const batchSize = Math.max(
      10,
      Math.min(
        DEFAULT_BATCH_SIZE,
        Number(process.env.ECHO_DISCORD_PRESENCE_BATCH_SIZE?.trim()) ||
          DEFAULT_BATCH_SIZE,
      ),
    );

    const members = getNextBatch(guild, batchSize);
    if (members.length === 0) return;

    const presences = members.map(buildPresenceSnapshot);

    await postPresenceBatch({
      discordGuildId: guild.id,
      guildName: guild.name,
      snapshotAt: Date.now(),
      presences,
    });
  } catch (e) {
    console.warn(`[presence-relay] Failed to poll guild ${guildId}:`, e);
  }
}

async function refreshWatchlist(client: Client): Promise<Set<string>> {
  const body = await getEchoWebhookJson<{ guildIds?: unknown }>(
    '/api/v1/hooks/discord-presence/watchlist',
    'presence',
  );
  if (!body) return new Set();
  const ids = body.guildIds;
  if (!Array.isArray(ids)) return new Set();

  const validIds = new Set<string>();
  for (const id of ids) {
    if (typeof id === 'string' && /^\d{10,25}$/.test(id.trim())) {
      validIds.add(id.trim());
    }
  }
  return validIds;
}

export function startDiscordPresenceRelay(client: Client): void {
  const pollMs = parseMinInteger(
    process.env.ECHO_DISCORD_PRESENCE_POLL_MS,
    DEFAULT_POLL_INTERVAL_MS,
    15_000,
  );

  let cachedGuildIds = new Set<string>();

  void refreshWatchlist(client).then((ids) => {
    cachedGuildIds = ids;
    console.log(`[presence-relay] Watching ${ids.size} guild(s) for presence`);
  });

  const watchlistInterval = setInterval(() => {
    void refreshWatchlist(client).then((ids) => {
      if (ids.size !== cachedGuildIds.size) {
        console.log(`[presence-relay] Watchlist updated: ${ids.size} guild(s)`);
      }
      cachedGuildIds = ids;
    });
  }, 120_000);

  const pollInterval = setInterval(() => {
    if (cachedGuildIds.size === 0) return;

    const guildList = [...cachedGuildIds];
    const index = Math.floor(Date.now() / pollMs) % guildList.length;
    const guildId = guildList[index];

    if (guildId) {
      void pollGuildPresence(client, guildId);
    }
  }, pollMs);

  client.on('presenceUpdate', (_oldPresence, newPresence) => {
    const guildId = newPresence.guild?.id;
    if (!guildId || !cachedGuildIds.has(guildId)) return;

    const member = newPresence.member;
    if (!member) return;

    const now = Date.now();
    const lastCheck = lastUserCheck.get(member.user.id) ?? 0;
    if (now - lastCheck < 5000) return;

    lastUserCheck.set(member.user.id, now);

    void postPresenceBatch({
      discordGuildId: guildId,
      guildName: newPresence.guild?.name ?? '',
      snapshotAt: now,
      presences: [buildPresenceSnapshot(member)],
    });
  });

  client.on('shardDisconnect', () => {
    clearInterval(pollInterval);
    clearInterval(watchlistInterval);
    lastUserCheck.clear();
    guildCheckQueues.clear();
    guildBatchIndices.clear();
  });
}
