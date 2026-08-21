import { getChannelDisplayName } from '@/assets/icons';

export type UserVoiceChannelPresence = {
  serverId: string;
  serverName: string;
  /** Optional server banner image (used for contextual VC card backgrounds). */
  serverBannerImageUrl?: string;
  channelId: string;
  /** Raw channel name from tree (before display-name transform). */
  channelName: string;
  /** Participant ids currently present in the VC row (deduped, stable order). */
  participantUserIds: string[];
  /** Participant avatar URLs aligned with `participantUserIds` when known. */
  participantPfps: string[];
};

type VoiceChannelRow = {
  id: string;
  name: string;
  type?: string;
  voiceParticipantIds?: string[];
};

type CategoryRow = { channels?: VoiceChannelRow[] };

/**
 * Scan hydrated guild channel trees for voice channels that list `userId` in
 * `voiceParticipantIds`. Used for profile “in voice” activity widgets.
 */
export function findUserVoicePresences(
  userId: string,
  input: {
    categoriesByServer: Record<string, CategoryRow[] | undefined>;
    servers: Array<{ id: string; name: string; bannerImageUrl?: string }>;
    users?: Array<{ id: string; pfp?: string }>;
    /** When set, matching rows from this server are sorted first. */
    preferServerId?: string | null;
  },
): UserVoiceChannelPresence[] {
  const uid = userId.trim();
  if (!uid) return [];

  const nameById = new Map(
    (input.servers ?? []).map((s) => [s.id, (s.name ?? '').trim() || 'Server']),
  );
  const bannerByServerId = new Map(
    (input.servers ?? []).map((s) => [s.id, (s.bannerImageUrl ?? '').trim()]),
  );
  const pfpByUserId = new Map(
    (input.users ?? []).map((u) => [u.id, (u.pfp ?? '').trim()]),
  );

  const out: UserVoiceChannelPresence[] = [];
  const seenChannel = new Set<string>();

  for (const [serverId, categories] of Object.entries(
    input.categoriesByServer ?? {},
  )) {
    if (!serverId || serverId === 'echo') continue;
    if (!Array.isArray(categories)) continue;

    for (const cat of categories) {
      for (const ch of cat.channels ?? []) {
        if (ch.type !== 'voice') continue;
        const ids = ch.voiceParticipantIds ?? [];
        if (!ids.includes(uid)) continue;
        const cid = ch.id?.trim();
        if (!cid || seenChannel.has(cid)) continue;
        seenChannel.add(cid);
        const participantUserIds = ids
          .map((id) => String(id).trim())
          .filter(Boolean);
        const participantPfps = participantUserIds
          .map((id) => pfpByUserId.get(id) ?? '')
          .filter(Boolean);
        const banner = bannerByServerId.get(serverId) ?? '';
        out.push({
          serverId,
          serverName: nameById.get(serverId) ?? 'Server',
          ...(banner ? { serverBannerImageUrl: banner } : {}),
          channelId: cid,
          channelName: (ch.name ?? '').trim() || 'Voice',
          participantUserIds,
          participantPfps,
        });
      }
    }
  }

  const pref = input.preferServerId?.trim();
  if (pref && pref !== 'echo') {
    out.sort((a, b) => {
      const da = a.serverId === pref ? 0 : 1;
      const db = b.serverId === pref ? 0 : 1;
      return da - db;
    });
  }

  return out;
}

export function formatVoiceChannelLabel(channelName: string): string {
  return getChannelDisplayName(channelName);
}
