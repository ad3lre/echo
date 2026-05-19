import type { Socket } from 'socket.io-client';

/**
 * Inbound Socket.IO handlers for Echo realtime. Payloads are narrowed inside `useSocket`;
 * here we only pair `on` / `off` for the same function references.
 */
export interface EchoSocketInboundListeners {
  onMessage: (...args: unknown[]) => void;
  onMessageFailed: (...args: unknown[]) => void;
  onMessageAck: (...args: unknown[]) => void;
  onMessageUpdated: (...args: unknown[]) => void;
  onMessageEmbeds: (...args: unknown[]) => void;
  onMessageMediaMirror: (...args: unknown[]) => void;
  onMessageDeleted: (...args: unknown[]) => void;
  onMessageReactions: (...args: unknown[]) => void;
  onMessagePins: (...args: unknown[]) => void;
  onSocketConnected: (...args: unknown[]) => void;
  onDisconnectIo: (...args: unknown[]) => void;
  onConnectError: (...args: unknown[]) => void;
  onDmActivityIo: (...args: unknown[]) => void;
  onDmCallIo: (...args: unknown[]) => void;
  onReadStateUpdateIo: (...args: unknown[]) => void;
  onAttentionUpdateIo: (...args: unknown[]) => void;
  onPresenceIo: (...args: unknown[]) => void;
  onEchoWorkspaceEventIo: (...args: unknown[]) => void;
  onPollUpdated: (...args: unknown[]) => void;
  onPollVoteFailed: (...args: unknown[]) => void;
  onChannelTypingIo: (...args: unknown[]) => void;
  onDeployCountdownIo: (...args: unknown[]) => void;
}

export function attachEchoSocketInbound(
  socket: Socket,
  L: EchoSocketInboundListeners,
): void {
  socket.on('message', L.onMessage);
  socket.on('message_failed', L.onMessageFailed);
  socket.on('message_ack', L.onMessageAck);
  socket.on('message:updated', L.onMessageUpdated);
  socket.on('message:embeds', L.onMessageEmbeds);
  socket.on('message:media_mirror', L.onMessageMediaMirror);
  socket.on('message:deleted', L.onMessageDeleted);
  socket.on('message:reactions', L.onMessageReactions);
  socket.on('message:pins', L.onMessagePins);
  socket.on('connect', L.onSocketConnected);
  socket.on('disconnect', L.onDisconnectIo);
  socket.on('connect_error', L.onConnectError);
  socket.on('dm:activity', L.onDmActivityIo);
  socket.on('dm:call', L.onDmCallIo);
  socket.on('read_state:update', L.onReadStateUpdateIo);
  socket.on('attention:update', L.onAttentionUpdateIo);
  socket.on('presence:update', L.onPresenceIo);
  socket.on('echo:workspace_event', L.onEchoWorkspaceEventIo);
  socket.on('poll:updated', L.onPollUpdated);
  socket.on('poll:vote_failed', L.onPollVoteFailed);
  socket.on('channel:typing', L.onChannelTypingIo);
  socket.on('app:deploy_countdown', L.onDeployCountdownIo);
}

export function detachEchoSocketInbound(
  socket: Socket,
  L: EchoSocketInboundListeners,
): void {
  socket.off('message', L.onMessage);
  socket.off('message_failed', L.onMessageFailed);
  socket.off('message_ack', L.onMessageAck);
  socket.off('message:updated', L.onMessageUpdated);
  socket.off('message:embeds', L.onMessageEmbeds);
  socket.off('message:media_mirror', L.onMessageMediaMirror);
  socket.off('message:deleted', L.onMessageDeleted);
  socket.off('message:reactions', L.onMessageReactions);
  socket.off('message:pins', L.onMessagePins);
  socket.off('connect', L.onSocketConnected);
  socket.off('disconnect', L.onDisconnectIo);
  socket.off('connect_error', L.onConnectError);
  socket.off('dm:activity', L.onDmActivityIo);
  socket.off('dm:call', L.onDmCallIo);
  socket.off('read_state:update', L.onReadStateUpdateIo);
  socket.off('attention:update', L.onAttentionUpdateIo);
  socket.off('presence:update', L.onPresenceIo);
  socket.off('echo:workspace_event', L.onEchoWorkspaceEventIo);
  socket.off('poll:updated', L.onPollUpdated);
  socket.off('poll:vote_failed', L.onPollVoteFailed);
  socket.off('channel:typing', L.onChannelTypingIo);
  socket.off('app:deploy_countdown', L.onDeployCountdownIo);
}
