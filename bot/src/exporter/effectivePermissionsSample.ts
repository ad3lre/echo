import type { Guild, GuildBasedChannel, GuildMember } from 'discord.js';

export function buildEffectivePermissionsSample(
  guild: Guild,
  members: GuildMember[],
  channelLimit: number,
): Record<string, Record<string, string>> {
  const channels = [...guild.channels.cache.values()]
    .filter(
      (c): c is GuildBasedChannel =>
        !c.isThread() &&
        'permissionsFor' in c &&
        typeof c.permissionsFor === 'function',
    )
    .slice(0, Math.max(0, channelLimit));

  const out: Record<string, Record<string, string>> = {};
  for (const m of members) {
    if (!m.user) continue;
    out[m.id] = {};
    for (const c of channels) {
      const perms = c.permissionsFor(m);
      if (!perms) continue;
      out[m.id][c.id] = perms.bitfield.toString();
    }
  }
  return out;
}
