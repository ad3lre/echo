import { resolveEchoDmWireChannelId } from '@/features/layout/resolveEchoDmWireChannelId';

type GroupDmRow = { id: string };

/**
 * Whether the user is already focused on the conversation an incoming message belongs to.
 * Handles guild channels (exact id) and DM aliases (`dm-{peer}` shell vs wire snowflake).
 */
export function isViewingEchoConversationChannel(
  incomingChannelId: string,
  activeChannelId: string,
  opts?: {
    echoDmPeerByChannelId?: ReadonlyMap<string, string>;
    groupDMs?: Readonly<Record<string, GroupDmRow | undefined>>;
  },
): boolean {
  const ch = incomingChannelId.trim();
  const ac = activeChannelId.trim();
  if (!ch || !ac) return false;
  if (ac === ch) return true;

  const map = opts?.echoDmPeerByChannelId;
  if (map) {
    const wiredAc = resolveEchoDmWireChannelId(ac, map);
    if (wiredAc === ch) return true;
    const peerForCh = map.get(ch);
    if (peerForCh && ac === `dm-${peerForCh}`) return true;
  }

  const groupDMs = opts?.groupDMs;
  if (groupDMs) {
    for (const [key, row] of Object.entries(groupDMs)) {
      if (key !== ch && row?.id !== ch) continue;
      if (ac === key || ac === row?.id) return true;
    }
  }

  return false;
}
