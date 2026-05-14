import type { ChannelSummary } from '@shared/types';
import type { Server } from '@shared/types';
import type { GuildVoiceActivityCard } from '@/features/layout/appLayoutLeftChromeProps';

type CategoriesSlice = Array<{
  channels?: Array<ChannelSummary & { voiceParticipantIds?: string[] }>;
}>;

export function buildGuildVoiceActivityCardsForJoinedServers(input: {
  joinedServers: readonly Server[];
  categoriesByServer: Readonly<Record<string, CategoriesSlice | undefined>>;
  roster: ReadonlyArray<{ id: string; pfp?: string | null }>;
  getChannelDisplayName: (rawName: string) => string;
  resolveCallTileAvatarUrl: (pfp: string, userId: string) => string;
}): GuildVoiceActivityCard[] {
  const rows: GuildVoiceActivityCard[] = [];
  const pfpFor = (userId: string) =>
    input.roster.find((u) => u.id === userId)?.pfp?.trim() ?? '';

  for (const server of input.joinedServers) {
    const sid = server.id?.trim();
    if (!sid || sid === 'echo') continue;
    const cats = input.categoriesByServer[sid] ?? [];
    for (const cat of cats) {
      for (const ch of cat.channels ?? []) {
        if (ch.type !== 'voice') continue;
        const ids = ch.voiceParticipantIds ?? [];
        if (ids.length < 1) continue;
        const participantPreviewUserIds = ids.slice(0, 4);
        const participantPfpUrls = participantPreviewUserIds.map((userId) =>
          input.resolveCallTileAvatarUrl(pfpFor(userId), userId),
        );
        rows.push({
          serverId: sid,
          serverName: server.name?.trim() || 'Server',
          serverImageUrl: server.imageUrl,
          channelId: ch.id,
          channelName: ch.name,
          channelDisplayName: input.getChannelDisplayName(ch.name),
          participantCount: ids.length,
          participantPfpUrls,
          participantPreviewUserIds,
        });
      }
    }
  }

  rows.sort((a, b) => {
    const d = b.participantCount - a.participantCount;
    if (d !== 0) return d;
    const s = a.serverId.localeCompare(b.serverId);
    if (s !== 0) return s;
    return a.channelId.localeCompare(b.channelId);
  });
  return rows;
}
