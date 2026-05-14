import type { GuildBasedChannel } from 'discord.js';

/**
 * Discord.js `toJSON()` is API-shaped. Voice `bitrate` is kept by default for Echo `bitrate_bps` import mapping.
 */
export function channelToExport(
  ch: GuildBasedChannel,
  stripVoiceBitrate: boolean,
): Record<string, unknown> {
  const j = ch.toJSON() as Record<string, unknown>;
  if (stripVoiceBitrate) delete j.bitrate;
  return j;
}
