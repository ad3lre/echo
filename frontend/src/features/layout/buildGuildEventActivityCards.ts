import type { EchoWorkspaceMyEventRsvp } from '@/api/echoClient';
import type { GuildEventActivityCard } from '@/features/layout/appLayoutLeftChromeProps';

export function buildGuildEventActivityCardsFromMyRsvps(input: {
  rsvps: readonly EchoWorkspaceMyEventRsvp[];
  getChannelDisplayName: (rawName: string) => string;
}): GuildEventActivityCard[] {
  const rows: GuildEventActivityCard[] = [];
  for (const r of input.rsvps) {
    const sid = r.serverId?.trim();
    if (!sid || sid === 'echo') continue;
    rows.push({
      serverId: sid,
      serverName: r.serverName?.trim() || 'Server',
      serverImageUrl: r.serverImageUrl,
      eventImageUrl: r.imageUrl?.trim() || undefined,
      eventId: r.id,
      title: r.title?.trim() || 'Event',
      startsAt: r.startsAt,
      channelId: r.channelId,
      customLocation: r.customLocation?.trim() || null,
      channelDisplayName: r.channelName?.trim()
        ? input.getChannelDisplayName(r.channelName)
        : null,
      goingCount: r.goingCount ?? 0,
    });
  }
  rows.sort((a, b) => {
    const ta = new Date(a.startsAt).getTime();
    const tb = new Date(b.startsAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.eventId.localeCompare(b.eventId);
  });
  return rows;
}
