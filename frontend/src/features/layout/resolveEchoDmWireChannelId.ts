import { isDmThreadId } from '@/features/layout/mainSurface';

/**
 * Socket/API and `echo_channel_pins` use persisted Echo channel ids (snowflake/UUID).
 * Legacy shell ids `dm-{userId}` are not rows — pin/unpin must use the mapped DM thread id.
 */
export function resolveEchoDmWireChannelId(
  activeChannelId: string,
  echoDmPeerByChannelId: ReadonlyMap<string, string>,
): string {
  if (!activeChannelId) return activeChannelId;
  if (!isDmThreadId(activeChannelId)) return activeChannelId;
  if (activeChannelId.startsWith('dm-group-')) return activeChannelId;
  const peer = activeChannelId.slice('dm-'.length);
  if (!peer) return activeChannelId;
  for (const [ch, p] of echoDmPeerByChannelId) {
    if (p === peer) return ch;
  }
  return activeChannelId;
}
