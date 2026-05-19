import {
  type Client,
  type Guild,
  type GuildMember,
  ActivityType,
} from 'discord.js';
import { fetchEchoWebhook } from './echoFetch.js';

/**
 * Discord presence polling relay for Echo.
 * Polls guild members for their Discord activity status in safe batches,
 * rotating through users to distribute load.
 */

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

/** Tracks last check time per user to avoid over-polling. */
const lastUserCheck = new Map<string, number>();

/** Queue of user IDs to check, per guild. */
const guildCheckQueues = new Map<string, string[]>();

/** Current batch index per guild. */
const guildBatchIndices = new Map<string, number>();

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

/** Get members who need a presence check (rotating batches). */
function getNextBatch(guild: Guild, batchSize: number): GuildMember[] {
  const now = Date.now();
  const guildId = guild.id;

  // Initialize queue if empty or refresh if all users processed
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

  // Collect batchSize members, skipping recently checked ones
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

    // If we've gone full circle, stop
    if (idx >= startIdx + queue.length) break;
  }

  // Advance batch index for next poll
  const nextIndex = (batchIndex + 1) % Math.ceil(queue.length / batchSize || 1);
  guildBatchIndices.set(guildId, nextIndex);

  return batch;
}

/** Build presence snapshot from a guild member. */
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

/** Post presence batch to Echo backend. */
async function postPresenceBatch(batch: GuildPresenceBatch): Promise<void> {
  const secret = process.env.ECHO_DISCORD_BOT_WEBHOOK_SECRET?.trim();
  if (!secret) return;

  const url = `${echoApiBaseUrl()}/api/v1/hooks/discord-presence/snapshot`;

  try {
    const res = await fetchEchoWebhook(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-echo-discord-bot-secret': secret,
      },
      body: JSON.stringify(batch),
    });

    if (!res.ok && res.status !== 204) {
      const t = await res.text().catch(() => '');
      console.warn(
        `[presence-relay] snapshot HTTP ${res.status} for guild ${batch.discordGuildId}: ${t.slice(0, 200)}`,
      );
    }
  } catch (e) {
    console.warn('[presence-relay] snapshot failed', e);
  }
}

/** Poll a single guild for presence in batches. */
async function pollGuildPresence(
  client: Client,
  guildId: string,
): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  try {
    // Ensure members are cached
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

    const snapshot: GuildPresenceBatch = {
      discordGuildId: guild.id,
      guildName: guild.name,
      snapshotAt: Date.now(),
      presences,
    };

    await postPresenceBatch(snapshot);
  } catch (e) {
    console.warn(`[presence-relay] Failed to poll guild ${guildId}:`, e);
  }
}

/** Refresh the watchlist of guilds to poll. */
async function refreshWatchlist(client: Client): Promise<Set<string>> {
  const secret = process.env.ECHO_DISCORD_BOT_WEBHOOK_SECRET?.trim();
  if (!secret) return new Set();

  const url = `${echoApiBaseUrl()}/api/v1/hooks/discord-presence/watchlist`;

  try {
    const res = await fetchEchoWebhook(url, {
      method: 'GET',
      headers: { 'x-echo-discord-bot-secret': secret },
    });

    if (!res.ok) return new Set();

    const body = (await res.json()) as { guildIds?: unknown };
    const ids = body.guildIds;
    if (!Array.isArray(ids)) return new Set();

    const validIds = new Set<string>();
    for (const id of ids) {
      if (typeof id === 'string' && /^\d{10,25}$/.test(id.trim())) {
        validIds.add(id.trim());
      }
    }
    return validIds;
  } catch {
    return new Set();
  }
}

/**
 * Start the Discord presence polling relay.
 * Polls member presence in rotating batches and sends to Echo.
 */
export function startDiscordPresenceRelay(client: Client): void {
  const pollRaw = process.env.ECHO_DISCORD_PRESENCE_POLL_MS?.trim();
  const pollMs =
    pollRaw === undefined || pollRaw === ''
      ? DEFAULT_POLL_INTERVAL_MS
      : Math.max(15_000, Number(pollRaw));

  let cachedGuildIds = new Set<string>();

  // Initial watchlist fetch
  void refreshWatchlist(client).then((ids) => {
    cachedGuildIds = ids;
    console.log(`[presence-relay] Watching ${ids.size} guild(s) for presence`);
  });

  // Refresh watchlist periodically (every 2 minutes)
  const watchlistInterval = setInterval(() => {
    void refreshWatchlist(client).then((ids) => {
      if (ids.size !== cachedGuildIds.size) {
        console.log(`[presence-relay] Watchlist updated: ${ids.size} guild(s)`);
      }
      cachedGuildIds = ids;
    });
  }, 120_000);

  // Main polling loop
  const pollInterval = setInterval(() => {
    if (cachedGuildIds.size === 0) return;

    // Poll one guild per interval tick, rotating through them
    const guildList = [...cachedGuildIds];
    const index = Math.floor(Date.now() / pollMs) % guildList.length;
    const guildId = guildList[index];

    if (guildId) {
      void pollGuildPresence(client, guildId);
    }
  }, pollMs);

  // Listen for presence updates from Discord gateway (real-time)
  client.on('presenceUpdate', (_oldPresence, newPresence) => {
    const guildId = newPresence.guild?.id;
    if (!guildId || !cachedGuildIds.has(guildId)) return;

    const member = newPresence.member;
    if (!member) return;

    // Debounce rapid presence updates
    const now = Date.now();
    const lastCheck = lastUserCheck.get(member.user.id) ?? 0;
    if (now - lastCheck < 5000) return; // 5 second debounce

    lastUserCheck.set(member.user.id, now);

    // Send immediate update for this user
    const snapshot: GuildPresenceBatch = {
      discordGuildId: guildId,
      guildName: newPresence.guild?.name ?? '',
      snapshotAt: now,
      presences: [buildPresenceSnapshot(member)],
    };

    void postPresenceBatch(snapshot);
  });

  // Cleanup on client destroy
  client.on('shardDisconnect', () => {
    clearInterval(pollInterval);
    clearInterval(watchlistInterval);
    lastUserCheck.clear();
    guildCheckQueues.clear();
    guildBatchIndices.clear();
  });
}
