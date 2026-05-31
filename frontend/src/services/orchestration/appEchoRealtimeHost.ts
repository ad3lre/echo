import type {
  EchoAttentionChannelSummary,
  EchoAttentionSnapshot,
} from '@shared/types';
import type {
  EchoPinRollbackSync,
  EchoRealtimeHostPorts,
} from '@/services/realtime/echoRealtimePort';

/** Dependencies for the app shell's `EchoRealtimeHostPorts` (layout → socket domain). */
export type AppLayoutEchoRealtimeHostInput = {
  onPresenceUpdate: EchoRealtimeHostPorts['presence']['applyPresenceUpdate'];
  onDmActivity: EchoRealtimeHostPorts['dm']['applyDmActivity'];
  onDmCall: EchoRealtimeHostPorts['dm']['applyDmCall'];
  onDmThreadActivity: EchoRealtimeHostPorts['dm']['applyDmThreadActivity'];
  mergeReadStateUpdate: (
    channelId: string,
    lastReadMessageId: string | null,
    channelAttention?: EchoAttentionChannelSummary,
  ) => void;
  replaceAttentionSnapshot: (snapshot: EchoAttentionSnapshot) => void;
  onEchoWorkspaceEvent: EchoRealtimeHostPorts['workspace']['applyWorkspaceEvent'];
  setChannelPinsFromEcho: (channelId: string, messageIds: string[]) => void;
  pinRollbackSync: EchoPinRollbackSync;
  applyEchoChannelClientCap: (channelId: string) => void;
  onSocketConnected: EchoRealtimeHostPorts['lifecycle']['onSocketConnected'];
  onSocketDisconnected: EchoRealtimeHostPorts['lifecycle']['onSocketDisconnected'];
  onConnectError: EchoRealtimeHostPorts['errors']['onConnectError'];
  onUnexpectedDisconnect: EchoRealtimeHostPorts['errors']['onUnexpectedDisconnect'];
  onMessageFailed: EchoRealtimeHostPorts['errors']['onMessageFailed'];
  onJoinChannelDenied: EchoRealtimeHostPorts['errors']['onJoinChannelDenied'];
  applyChannelTyping: EchoRealtimeHostPorts['typing']['applyChannelTyping'];
  applyRealtimeAuthorHint: EchoRealtimeHostPorts['authorHints']['applyAuthorHint'];
};

/** Builds the realtime host ports object from explicit shell callbacks. */
export function createAppLayoutEchoRealtimeHost(
  input: AppLayoutEchoRealtimeHostInput,
): EchoRealtimeHostPorts {
  return {
    presence: { applyPresenceUpdate: input.onPresenceUpdate },
    dm: {
      applyDmActivity: input.onDmActivity,
      applyDmCall: input.onDmCall,
      applyDmThreadActivity: input.onDmThreadActivity,
    },
    attention: {
      applyReadStateUpdate: (payload) =>
        input.mergeReadStateUpdate(
          payload.channelId,
          payload.lastReadMessageId,
          payload.channelAttention,
        ),
      applyAttentionSnapshot: input.replaceAttentionSnapshot,
    },
    workspace: { applyWorkspaceEvent: input.onEchoWorkspaceEvent },
    pins: {
      applyChannelPinsUpdate: (payload) =>
        input.setChannelPinsFromEcho(payload.channelId, payload.messageIds),
      pinRollbackSync: input.pinRollbackSync,
    },
    clientCaps: { applyEchoChannelClientCap: input.applyEchoChannelClientCap },
    lifecycle: {
      onSocketConnected: input.onSocketConnected,
      onSocketDisconnected: input.onSocketDisconnected,
    },
    errors: {
      onConnectError: input.onConnectError,
      onUnexpectedDisconnect: input.onUnexpectedDisconnect,
      onMessageFailed: input.onMessageFailed,
      onJoinChannelDenied: input.onJoinChannelDenied,
    },
    typing: { applyChannelTyping: input.applyChannelTyping },
    authorHints: { applyAuthorHint: input.applyRealtimeAuthorHint },
  };
}
