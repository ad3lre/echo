import type { EchoRealtimeHostPorts } from '@/services/realtime/echoRealtimePort';
import type { EchoSocketInboundListeners } from '@/services/realtime/socketInbound';
import type {
  EchoRealtimeChatIngestPort,
  EchoRealtimeTypingIngestPort,
} from '@/services/realtime/echoRealtimeChatIngest';
import type {
  EchoAttentionSnapshot,
  EchoDmActivityEvent,
  EchoDmCallEvent,
  EchoDmThreadActivityEvent,
  EchoWorkspaceEvent,
} from '@shared/types';
import { dbgReadState } from '@/utils/echoReadStateDebug';
import {
  applyDeployCountdownSocketPayload,
  clearDeployCountdown,
} from '@/utils/deployCountdownOverlay';

export type EchoSocketInboundRuntime = {
  connectErrorLogged: boolean;
};

export function createEchoSocketInboundListeners(opts: {
  host: EchoRealtimeHostPorts;
  chat: EchoRealtimeChatIngestPort;
  typing: EchoRealtimeTypingIngestPort;
  inboundRuntime: EchoSocketInboundRuntime;
}): EchoSocketInboundListeners {
  const onMessage = (...args: unknown[]) => {
    opts.chat.onMessage(args[0]);
  };

  const onMessageFailed = (...args: unknown[]) => {
    opts.chat.onMessageFailed(args[0]);
  };

  const onMessageUpdated = (...args: unknown[]) => {
    opts.chat.onMessageUpdated(args[0]);
  };

  const onMessageEmbeds = (...args: unknown[]) => {
    opts.chat.onMessageEmbeds(args[0]);
  };

  const onMessageMediaMirror = (...args: unknown[]) => {
    opts.chat.onMessageMediaMirror(args[0]);
  };

  const onMessageDeleted = (...args: unknown[]) => {
    opts.chat.onMessageDeleted(args[0]);
  };

  const onMessagePins = (...args: unknown[]) => {
    opts.chat.onMessagePins(args[0]);
  };

  const onMessageReactions = (...args: unknown[]) => {
    opts.chat.onMessageReactions(args[0]);
  };

  const onPollUpdated = (...args: unknown[]) => {
    opts.chat.onPollUpdated(args[0]);
  };

  const onPollVoteFailed = (...args: unknown[]) => {
    opts.chat.onPollVoteFailed(args[0]);
  };

  const onMessageAck = (...args: unknown[]) => {
    opts.chat.onMessageAck(args[0]);
  };

  const onSocketConnected: EchoSocketInboundListeners['onSocketConnected'] = (
    ..._args
  ) => {
    opts.inboundRuntime.connectErrorLogged = false;
    clearDeployCountdown();
  };

  const onDeployCountdownIo: EchoSocketInboundListeners['onDeployCountdownIo'] =
    (...args) => {
      applyDeployCountdownSocketPayload(args[0]);
    };

  const onPresenceIo: EchoSocketInboundListeners['onPresenceIo'] = (
    ...args
  ) => {
    opts.host.presence.applyPresenceUpdate(
      args[0] as {
        userId: string;
        status: string;
        activeClient?: 'mobile' | 'web';
      },
    );
  };

  const onDmActivityIo: EchoSocketInboundListeners['onDmActivityIo'] = (
    ...args
  ) => {
    const payload = args[0] as EchoDmActivityEvent;
    opts.host.dm.applyDmActivity(payload);
    opts.chat.onMessage(payload.message);
  };

  const onDmCallIo: EchoSocketInboundListeners['onDmCallIo'] = (...args) => {
    const payload = args[0] as EchoDmCallEvent;
    opts.host.dm.applyDmCall(payload);
  };

  const onDmThreadActivityIo: EchoSocketInboundListeners['onDmThreadActivityIo'] =
    (...args) => {
      const payload = args[0] as EchoDmThreadActivityEvent;
      opts.host.dm.applyDmThreadActivity(payload);
    };

  const onReadStateUpdateIo: EchoSocketInboundListeners['onReadStateUpdateIo'] =
    (...args) => {
      const payload = args[0] as {
        channelId: string;
        lastReadMessageId: string | null;
        channelAttention?: import('@shared/types').EchoAttentionChannelSummary;
      };
      dbgReadState('socket_inbound_read_state_update', payload);
      opts.host.attention.applyReadStateUpdate(payload);
    };

  const onAttentionUpdateIo: EchoSocketInboundListeners['onAttentionUpdateIo'] =
    (...args) => {
      opts.host.attention.applyAttentionSnapshot(
        args[0] as EchoAttentionSnapshot,
      );
    };

  const onEchoWorkspaceEventIo: EchoSocketInboundListeners['onEchoWorkspaceEventIo'] =
    (...args) => {
      opts.host.workspace.applyWorkspaceEvent(args[0] as EchoWorkspaceEvent);
    };

  function onDisconnectIo(...args: unknown[]) {
    const reason = args[0] as string;
    opts.host.errors.onUnexpectedDisconnect(reason);
  }

  const onConnectError = (...args: unknown[]) => {
    if (opts.inboundRuntime.connectErrorLogged) return;
    opts.inboundRuntime.connectErrorLogged = true;
    opts.host.errors.onConnectError(args[0] as Error);
  };

  const onChannelTypingIo: EchoSocketInboundListeners['onChannelTypingIo'] = (
    ...args
  ) => {
    opts.typing.onChannelTypingIo(args[0]);
  };

  return {
    onMessage,
    onMessageFailed,
    onMessageAck,
    onMessageUpdated,
    onMessageEmbeds,
    onMessageMediaMirror,
    onMessageDeleted,
    onMessageReactions,
    onMessagePins,
    onSocketConnected,
    onDisconnectIo,
    onConnectError,
    onDmActivityIo,
    onDmCallIo,
    onDmThreadActivityIo,
    onReadStateUpdateIo,
    onAttentionUpdateIo,
    onPresenceIo,
    onEchoWorkspaceEventIo,
    onPollUpdated,
    onPollVoteFailed,
    onChannelTypingIo,
    onDeployCountdownIo,
  };
}
