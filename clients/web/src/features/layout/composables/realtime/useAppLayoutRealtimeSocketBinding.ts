import type { Ref, ComputedRef } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { useSocket } from '@/features/layout/useSocket';
import { createAppEchoRealtimeSocketBinding } from '@/features/layout/realtime/appEchoRealtimeSocketBinding';
import {
  createAppLayoutEchoRealtimeHost,
  type AppLayoutEchoRealtimeHostInput,
} from '@/features/layout/realtime/appEchoRealtimeHost';
import { useChannelTypingStore } from '@/features/chat/channelTyping';
import type { LocalAuthorEchoSnapshot } from '@/features/layout/realtime/socketOutbound';
import { registerEchoSocketWarmConnect } from '@/features/layout/realtime/echoSocketWarmConnect';
import {
  registerEchoGameSocketGetter,
  setEchoGameSocketConnected,
} from '@/features/games/echoGameSocketRegistry';
import type { EchoSocketAuthKey } from '@/features/layout/realtime/echoSocketSessionLifecycle';

export type AppLayoutEchoRealtimeHostCallbacks = Omit<
  AppLayoutEchoRealtimeHostInput,
  'applyChannelTyping'
>;

/**
 * Binds the app shell to the realtime socket: channel typing store + host ports + `useSocket` wiring.
 * Keeps `useAppLayoutController` free of inline `createAppLayoutEchoRealtimeHost` / binding assembly.
 */
export function useAppLayoutRealtimeSocketBinding(deps: {
  messages: Ref<Record<string, RawMessage[]>>;
  activeChannelId: Ref<string>;
  currentUserId: ComputedRef<string | undefined>;
  hostCallbacks: AppLayoutEchoRealtimeHostCallbacks;
  getAuthKey: () => EchoSocketAuthKey;
  platformSession: {
    setLiveSyncConnected: (connected: boolean) => void;
  } | null;
  getBackendUserStatus: () => string | undefined;
  restoreSessionFromApi: () => void | Promise<unknown>;
  getLocalAuthorEcho?: () => LocalAuthorEchoSnapshot | undefined;
  getDmPeerUserId?: (channelId: string) => string | undefined;
  getAccessToken?: () => string | null | undefined;
  ensureReplyTargetMessage?: (channelId: string, messageId: string) => void;
  /** When the tab returns while Socket.IO is still up, merge missed channel tail rows. */
  onTabResumeWhileConnected?: () => void;
}) {
  const channelTyping = useChannelTypingStore();
  const host = createAppLayoutEchoRealtimeHost({
    ...deps.hostCallbacks,
    applyChannelTyping: (p) => channelTyping.ingestRemote(p),
  });
  const binding = createAppEchoRealtimeSocketBinding({
    messages: deps.messages,
    activeChannelId: deps.activeChannelId,
    currentUserId: deps.currentUserId,
    host,
    getAuthKey: deps.getAuthKey,
    platformSession: deps.platformSession,
    getBackendUserStatus: deps.getBackendUserStatus,
    restoreSessionFromApi: deps.restoreSessionFromApi,
    getLocalAuthorEcho: deps.getLocalAuthorEcho,
    getDmPeerUserId: deps.getDmPeerUserId,
    getAccessToken: deps.getAccessToken,
    ensureReplyTargetMessage: deps.ensureReplyTargetMessage,
    onTabResumeWhileConnected: deps.onTabResumeWhileConnected,
  });
  registerEchoSocketWarmConnect(() => binding.wiring.connectSocket());
  registerEchoGameSocketGetter(() => binding.wiring.io.socket);
  return useSocket(binding);
}
