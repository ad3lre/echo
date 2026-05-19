import type { ChannelCategory } from '@/composables/useChannels';
import { isEchoGraphId } from '@/utils/echoIds';

/**
 * Guild voice join/leave APIs are scoped by server id. `selectedServer` can drift
 * (DM rail, Explore, another guild) while the user remains connected in VC — resolve
 * the owning server from the channel tree instead of trusting selection alone.
 */
export function resolveEchoServerIdContainingChannel(
  channelId: string | null | undefined,
  categoriesByServer: Readonly<Record<string, ChannelCategory[]>>,
): string {
  const cid = channelId?.trim() ?? '';
  if (!cid) return '';
  for (const [serverId, cats] of Object.entries(categoriesByServer)) {
    if (!isEchoGraphId(serverId)) continue;
    for (const cat of cats ?? []) {
      for (const ch of cat.channels ?? []) {
        if (ch.id === cid) return serverId;
      }
    }
  }
  return '';
}

/**
 * Guild workspace snapshot: which voice channel lists this user as connected.
 * Returns the first match if data is inconsistent.
 */
export function findEchoVoiceChannelIdContainingUserOnServer(
  serverId: string,
  userId: string,
  categoriesByServer: Readonly<Record<string, ChannelCategory[]>>,
): string | null {
  const sid = serverId?.trim() ?? '';
  const uid = userId?.trim() ?? '';
  if (!sid || !uid) return null;
  const cats = categoriesByServer[sid];
  if (!cats?.length) return null;
  for (const cat of cats) {
    for (const ch of cat.channels ?? []) {
      if (ch.type !== 'voice') continue;
      const ids =
        (ch as { voiceParticipantIds?: string[] }).voiceParticipantIds ?? [];
      if (ids.includes(uid)) return ch.id;
    }
  }
  return null;
}
