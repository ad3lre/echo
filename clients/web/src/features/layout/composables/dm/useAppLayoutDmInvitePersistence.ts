import type { Ref } from 'vue';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import { openEchoDirectDmChannel } from '@/features/dm/echoDmCommandFacade';
import { isEchoGraphId } from '@/features/layout/ids/echoIds';

export function createEnsurePersistedDirectDmChannelIdForInvite(deps: {
  authSession: ReturnType<typeof useAuthSessionStore>;
  echoDmPeerByChannelId: Ref<Map<string, string>>;
  mergeEchoDmThreadFromRealtime: (thread: {
    channelId: string;
    kind: 'direct';
    peerUserId: string;
  }) => void;
}): (peerUserId: string) => Promise<string> {
  return async function ensurePersistedDirectDmChannelIdForInvite(
    peerUserId: string,
  ): Promise<string> {
    const uid = peerUserId.trim();
    if (!uid) return '';
    for (const [channelId, peerId] of deps.echoDmPeerByChannelId.value) {
      if (peerId === uid && isEchoGraphId(channelId)) return channelId;
    }
    const token = deps.authSession.accessToken?.trim() ?? '';
    if (!token) return '';
    const channelId = await openEchoDirectDmChannel(token, uid);
    if (!channelId?.trim()) return '';
    const cid = channelId.trim();
    deps.mergeEchoDmThreadFromRealtime({
      channelId: cid,
      kind: 'direct',
      peerUserId: uid,
    });
    return cid;
  };
}
