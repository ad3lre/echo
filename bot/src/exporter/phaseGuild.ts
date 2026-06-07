import type {
  Guild,
  GuildBasedChannel,
  PermissionOverwriteManager,
} from 'discord.js';
import { ChannelType } from 'discord.js';
import { channelToExport } from './channelSerialize.js';
import type { CliFlags } from '../config.js';
import { appendJsonl, writeJson } from '../util/fs.js';

type ExportableGuildChannel = GuildBasedChannel & {
  rawPosition: number;
  permissionOverwrites: PermissionOverwriteManager;
};

function isExportableGuildChannel(
  ch: GuildBasedChannel,
): ch is ExportableGuildChannel {
  if (ch.isThread()) return false;
  return 'rawPosition' in ch && 'permissionOverwrites' in ch;
}

function sortChannelsByRawPosition(
  a: ExportableGuildChannel,
  b: ExportableGuildChannel,
): number {
  if (a.rawPosition !== b.rawPosition) return a.rawPosition - b.rawPosition;
  return a.id.localeCompare(b.id);
}

/** Result of `TextChannel#threads.fetchActive` / `fetchArchived` (Collection of threads). */
type ThreadManagerFetch = {
  threads?: { values: () => IterableIterator<unknown> };
} | null;

function sortRolesForExport<T extends { position: number; id: string }>(
  a: T,
  b: T,
): number {
  const dp = b.position - a.position;
  if (dp !== 0) return dp;
  return a.id.localeCompare(b.id);
}

export type PhaseGuildStats = {
  roleCount: number;
  parentChannelCount: number;
  forumPostCount: number;
  /** Active + archived threads under text / announcement channels (not forum posts). */
  channelThreadCount: number;
  overwriteRowCount: number;
  scheduledEventsWritten: boolean;
  autoModWritten: boolean;
};

export async function runPhaseGuild(
  guild: Guild,
  outDir: string,
  flags: CliFlags,
): Promise<PhaseGuildStats> {
  const full = await guild.fetch();
  await full.channels.fetch();
  await full.roles.fetch();

  const guildPayload = full.toJSON() as Record<string, unknown>;
  await writeJson(`${outDir}/guild.json`, guildPayload);

  const roles = [...full.roles.cache.values()].sort(sortRolesForExport);
  await writeJson(
    `${outDir}/roles.json`,
    roles.map((r) => r.toJSON()),
  );

  const parentChannels = [...full.channels.cache.values()]
    .filter(isExportableGuildChannel)
    .sort(sortChannelsByRawPosition);
  await writeJson(
    `${outDir}/channels.json`,
    parentChannels.map((ch) => channelToExport(ch, flags.stripVoiceBitrate)),
  );

  const forumPosts: Record<string, unknown>[] = [];
  const seenForumPostIds = new Set<string>();
  for (const ch of parentChannels) {
    if (ch.type !== ChannelType.GuildForum) continue;
    const forum = ch;
    const active = await forum.threads.fetchActive().catch(() => null);
    const activeThreads = active?.threads ? [...active.threads.values()] : [];
    for (const thread of activeThreads) {
      const id = thread?.id != null ? String(thread.id).trim() : '';
      if (!id || seenForumPostIds.has(id)) continue;
      forumPosts.push(thread.toJSON() as Record<string, unknown>);
      seenForumPostIds.add(id);
    }

    const archived = await forum.threads
      .fetchArchived({ type: 'public', fetchAll: true })
      .catch(() => null);
    const archivedThreads = archived?.threads
      ? [...archived.threads.values()]
      : [];
    for (const thread of archivedThreads) {
      const id = thread?.id != null ? String(thread.id).trim() : '';
      if (!id || seenForumPostIds.has(id)) continue;
      forumPosts.push(thread.toJSON() as Record<string, unknown>);
      seenForumPostIds.add(id);
    }
  }
  await writeJson(`${outDir}/forum_posts.json`, forumPosts);

  /** Threads under GUILD_TEXT / GUILD_ANNOUNCEMENT parents (forum threads stay in forum_posts.json). */
  const channelThreads: Record<string, unknown>[] = [];
  const seenChannelThreadIds = new Set<string>();
  for (const ch of parentChannels) {
    if (
      ch.type !== ChannelType.GuildText &&
      ch.type !== ChannelType.GuildAnnouncement
    )
      continue;
    if (
      !('threads' in ch) ||
      typeof (ch as { threads?: { fetchActive?: unknown } }).threads
        ?.fetchActive !== 'function'
    )
      continue;
    const textBased = ch as {
      threads: {
        fetchActive: () => Promise<unknown>;
        fetchArchived: (opts: { fetchAll?: boolean }) => Promise<unknown>;
      };
    };
    const activeThreads = (await textBased.threads
      .fetchActive()
      .catch(() => null)) as ThreadManagerFetch;
    const activeList: unknown[] = activeThreads?.threads
      ? [...activeThreads.threads.values()]
      : [];
    for (const thread of activeList) {
      const t = thread as {
        id?: string;
        toJSON?: () => Record<string, unknown>;
      };
      const id = t?.id != null ? String(t.id).trim() : '';
      if (!id || seenChannelThreadIds.has(id)) continue;
      seenChannelThreadIds.add(id);
      const json =
        typeof t.toJSON === 'function'
          ? t.toJSON()
          : (thread as Record<string, unknown>);
      channelThreads.push(json);
    }
    const archivedThreads = (await textBased.threads
      .fetchArchived({ fetchAll: true })
      .catch(() => null)) as ThreadManagerFetch;
    const archivedList: unknown[] = archivedThreads?.threads
      ? [...archivedThreads.threads.values()]
      : [];
    for (const thread of archivedList) {
      const t = thread as {
        id?: string;
        toJSON?: () => Record<string, unknown>;
      };
      const id = t?.id != null ? String(t.id).trim() : '';
      if (!id || seenChannelThreadIds.has(id)) continue;
      seenChannelThreadIds.add(id);
      const json =
        typeof t.toJSON === 'function'
          ? t.toJSON()
          : (thread as Record<string, unknown>);
      channelThreads.push(json);
    }
  }
  await writeJson(`${outDir}/channel_threads.json`, channelThreads);

  let overwriteRowCount = 0;
  if (flags.includeOverwritesJsonl) {
    const owPath = `${outDir}/overwrites.jsonl`;
    for (const ch of parentChannels) {
      for (const ow of ch.permissionOverwrites.cache.values()) {
        const row = ow.toJSON() as Record<string, unknown>;
        await appendJsonl(owPath, { channelId: ch.id, ...row });
        overwriteRowCount += 1;
      }
    }
  }

  await full.emojis.fetch();
  await writeJson(
    `${outDir}/emojis.json`,
    [...full.emojis.cache.values()].map((e) => e.toJSON()),
  );

  await full.stickers.fetch();
  await writeJson(
    `${outDir}/stickers.json`,
    [...full.stickers.cache.values()].map((s) => s.toJSON()),
  );

  let scheduledEventsWritten = false;
  if (flags.includeScheduledEvents) {
    try {
      const events = await full.scheduledEvents.fetch();
      await writeJson(
        `${outDir}/scheduled_events.json`,
        [...events.values()].map((e) => e.toJSON()),
      );
      scheduledEventsWritten = true;
    } catch (e) {
      console.warn('[export] scheduled_events skipped:', (e as Error).message);
    }
  }

  let autoModWritten = false;
  if (flags.includeAutoMod) {
    try {
      const rules = await full.autoModerationRules.fetch();
      await writeJson(
        `${outDir}/auto_moderation.json`,
        [...rules.values()].map((r) => r.toJSON()),
      );
      autoModWritten = true;
    } catch (e) {
      console.warn('[export] auto_moderation skipped:', (e as Error).message);
    }
  }

  return {
    roleCount: roles.length,
    parentChannelCount: parentChannels.length,
    forumPostCount: forumPosts.length,
    channelThreadCount: channelThreads.length,
    overwriteRowCount,
    scheduledEventsWritten,
    autoModWritten,
  };
}
