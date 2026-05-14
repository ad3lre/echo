import type { Guild } from 'discord.js';
import type { CliFlags } from '../config.js';
import { appendJsonl, writeJson } from '../util/fs.js';

export type PhaseOptionalStats = {
  invitesWritten: boolean;
  webhookRows: number;
};

export async function runPhaseOptional(
  guild: Guild,
  outDir: string,
  flags: CliFlags,
): Promise<PhaseOptionalStats> {
  let invitesWritten = false;
  let webhookRows = 0;

  if (flags.includeInvites) {
    try {
      const invites = await guild.invites.fetch();
      await writeJson(
        `${outDir}/invites.json`,
        [...invites.values()].map((i) => i.toJSON()),
      );
      invitesWritten = true;
    } catch (e) {
      console.warn('[export] invites skipped:', (e as Error).message);
    }
  }

  if (flags.includeWebhooks) {
    const path = `${outDir}/webhooks.jsonl`;
    for (const ch of guild.channels.cache.values()) {
      if (!('fetchWebhooks' in ch) || typeof ch.fetchWebhooks !== 'function')
        continue;
      try {
        const hooks = await ch.fetchWebhooks();
        for (const w of hooks.values()) {
          await appendJsonl(path, {
            id: w.id,
            type: w.type,
            name: w.name,
            avatar: w.avatar,
            channel_id: w.channelId,
            guild_id: w.guildId,
            application_id: w.applicationId,
            user: w.owner?.id ?? null,
            source_guild: w.sourceGuild?.id ?? null,
            source_channel: w.sourceChannel?.id ?? null,
          });
          webhookRows += 1;
        }
      } catch {
        /* missing access on this channel */
      }
    }
  }

  return { invitesWritten, webhookRows };
}
