import { iconEchoRounded } from '@/assets/branding';
import type { EchoDirectoryServerEntry } from '@/services/domain/echoInvitesAndDirectoryFromHttp';
import {
  filterPublicExploreDirectoryRows,
  type ExploreDirectoryRow,
} from '@/services/domain/exploreDirectoryRows';

export function mapEchoDirectoryServersToExploreRows(
  servers: EchoDirectoryServerEntry[],
): ExploreDirectoryRow[] {
  return filterPublicExploreDirectoryRows(
    servers.map((server) => {
      const row: ExploreDirectoryRow = {
        id: server.id,
        name: server.name,
        pfp:
          typeof server.iconUrl === 'string' && server.iconUrl.trim()
            ? server.iconUrl
            : iconEchoRounded,
      };
      const banner = server.bannerUrl?.trim();
      if (banner) row.banner = banner;
      const description = server.description?.trim();
      if (description) row.description = description;
      if (Array.isArray(server.tags) && server.tags.length) {
        row.tags = server.tags
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean);
      }
      if (
        typeof server.memberCount === 'number' &&
        Number.isFinite(server.memberCount)
      ) {
        row.memberCount = server.memberCount;
      }
      if (
        typeof server.voiceParticipantCount === 'number' &&
        Number.isFinite(server.voiceParticipantCount)
      ) {
        row.voiceParticipantCount = Math.max(
          0,
          Math.floor(server.voiceParticipantCount),
        );
      }
      const createdAt = server.createdAt?.trim();
      if (createdAt) row.createdAt = createdAt;
      if (typeof server.allowGlobalGuests === 'boolean') {
        row.allowGlobalGuests = server.allowGlobalGuests;
      }
      return row;
    }),
  );
}
