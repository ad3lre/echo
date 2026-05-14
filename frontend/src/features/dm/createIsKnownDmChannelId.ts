import { isDmThreadId } from '@/features/layout/mainSurface';

type ChannelContext = { channel: unknown } | null;

/**
 * DM rail / unread helpers: classify whether a channel id is a DM/group-DM thread
 * (vs a guild channel id that must not be treated as DM).
 */
export function createIsKnownDmChannelId(deps: {
  echoDmPeerByChannelId: () => ReadonlyMap<string, string>;
  hasGroupDmChannel: (channelId: string) => boolean;
  echoDmThreadIds: () => ReadonlySet<string>;
  findChannelContextById: (channelId: string) => ChannelContext;
}) {
  return function isKnownDmChannelId(channelId: string): boolean {
    const cid = channelId.trim();
    if (!cid) return false;
    if (isDmThreadId(cid)) return true;
    if (deps.echoDmPeerByChannelId().has(cid)) return true;
    if (deps.hasGroupDmChannel(cid)) return true;
    if (deps.findChannelContextById(cid)?.channel) return false;
    return deps.echoDmThreadIds().has(cid);
  };
}
