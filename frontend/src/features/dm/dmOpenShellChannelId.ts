import { isEchoAuthUserId, isEchoGraphId } from '@/utils/echoIds';

/**
 * Client-only `dm-{peerUserId}` id used while `POST /dm/open` resolves.
 * Not a persisted `echo_channels` row — must not drive history fetch or scroll memory.
 */
export function clientOnlyDmOpenShellIdForPeerUser(peerUserId: string): string {
  return `dm-${peerUserId.trim()}`;
}

export function isClientOnlyDmOpenShellChannelId(
  channelId: string | null | undefined,
): boolean {
  const cid = channelId?.trim() ?? '';
  if (!cid.startsWith('dm-') || cid.startsWith('dm-group-')) return false;
  if (isEchoGraphId(cid)) return false;
  const peerUserId = cid.slice('dm-'.length);
  return !!peerUserId && isEchoAuthUserId(peerUserId);
}
