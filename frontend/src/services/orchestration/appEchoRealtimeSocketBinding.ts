import type { Ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import type { UseSocketBinding } from '@/composables/useSocket';
import type { EchoRealtimeHostPorts } from '@/services/realtime/echoRealtimePort';
import { createEchoSocketRealtimeWiring } from '@/services/realtime/echoSocketRealtimeWiring';
import { createUiTransactionManager } from '@/ui/transactions/TransactionManager';
import { createEchoRealtimeMessageStoreBridge } from '@/services/realtime/echoRealtimeMessageStoreBridge';
import { registerEchoRealtimeUiControllerTransactions } from '@/services/orchestration/echoRealtimeUiControllerTransactions';
import { createEchoSocketSendMessage } from '@/services/realtime/echoSocketSendMessage';
import { createEchoSocketSubmitEmitters } from '@/services/realtime/echoSocketSubmitEmits';
import {
  createPresenceHeartbeatSession,
  resolveRelayablePresenceForOutbound,
  tryEmitPresenceSet,
  type PresenceEmitAdapter,
} from '@/services/realtime/socketPresenceSession';
import { applyEchoSocketActiveChannelChange } from '@/services/realtime/echoSocketSessionLifecycle';
import type { EchoSocketAuthKey } from '@/services/realtime/echoSocketSessionLifecycle';
import { registerChannelTypingSocketEmit } from '@/stores/channelTyping';
import { createEchoSocketInboundListeners } from '@/services/realtime/echoSocketInboundListeners';
import { newCorrelationId } from '@/services/realtime/socketOutbound';
import {
  createEchoRealtimeChatIngestPort,
  createEchoRealtimeTypingIngestPort,
} from '@/services/realtime/echoRealtimeChatIngest';
import {
  clearSocketXhrPollReloadGuard,
  defaultSocketReloadGuardBrowser,
  tryReloadForSocketXhrPollError,
} from '@/services/orchestration/socketReloadGuard';
import { defaultEchoRealtimeBrowserEvents } from '@/services/orchestration/echoRealtimeBrowserEvents';
import { registerDeferredMediaOutboundSend } from '@/services/realtime/deferredMediaOutboundSend';
import { createEchoRealtimePlatformSessionSync } from '@/services/orchestration/echoRealtimePlatformSessionSync';
import { ingestEchoSocketConnectError } from '@/services/realtime/socketConnectErrorIngest';
import { dispatchAppToastDetail } from '@/utils/controllerMissingAction';
import { devEchoBackendPort } from '@/config';
import type { LocalAuthorEchoSnapshot } from '@/services/realtime/socketOutbound';

export type AppEchoRealtimeSocketBindingInput = {
  messages: Ref<Record<string, RawMessage[]>>;
  activeChannelId: Ref<string>;
  currentUserId: Ref<string | undefined>;
  host: EchoRealtimeHostPorts;
  getAuthKey: () => EchoSocketAuthKey;
  platformSession: {
    setLiveSyncConnected: (connected: boolean) => void;
  } | null;
  getBackendUserStatus: () => string | undefined;
  restoreSessionFromApi: () => void | Promise<unknown>;
  /** Snapshot for optimistic outbound messages (display name / avatar from session). */
  getLocalAuthorEcho?: () => LocalAuthorEchoSnapshot | undefined;
  getDmPeerUserId?: (channelId: string) => string | undefined;
  getAccessToken?: () => string | null | undefined;
  /** Backfill missing reply targets discovered during inbound `message` ingest (deduped at the call site). */
  ensureReplyTargetMessage?: (channelId: string, messageId: string) => void;
  onTabResumeWhileConnected?: () => void;
};

const SOCKET_CONNECT_ERROR_PRIMARY_FLOW_COOLDOWN_MS = 20_000;

/**
 * App-shell assembly for the realtime socket binding.
 * Keeps auth/platform/session knowledge out of `useSocket`, which only owns Vue lifecycle glue.
 */
export function createAppEchoRealtimeSocketBinding(
  input: AppEchoRealtimeSocketBindingInput,
): UseSocketBinding {
  const browser = defaultSocketReloadGuardBrowser();
  const browserEvents = defaultEchoRealtimeBrowserEvents();
  const platformSync = createEchoRealtimePlatformSessionSync(
    input.platformSession,
  );
  return {
    activeChannelId: input.activeChannelId,
    getAuthKey: input.getAuthKey,
    wiring: createEchoSocketRealtimeWiring({
      activeChannelId: input.activeChannelId,
      onTabResumeWhileConnected: input.onTabResumeWhileConnected,
      createDomain: (transport) => {
        let lastConnectErrorPrimaryFlowAt = 0;
        const effectiveHost: EchoRealtimeHostPorts = {
          ...input.host,
          errors: {
            onConnectError: (err) => {
              ingestEchoSocketConnectError(err, {
                devPortHint: devEchoBackendPort(),
                restoreSessionFromApi: async () => {
                  await Promise.resolve(input.restoreSessionFromApi());
                },
                tryReloadForXhrPollError: () =>
                  tryReloadForSocketXhrPollError(browser),
                shouldReportPrimaryFlow: () => {
                  const now = Date.now();
                  if (
                    now - lastConnectErrorPrimaryFlowAt <
                    SOCKET_CONNECT_ERROR_PRIMARY_FLOW_COOLDOWN_MS
                  ) {
                    return false;
                  }
                  lastConnectErrorPrimaryFlowAt = now;
                  return true;
                },
              });
            },
            onUnexpectedDisconnect: (reason) => {
              void reason;
              // Reflect the drop in live-sync state immediately. The Manager auto-reconnects
              // without a teardown, so without this `liveSyncConnected` would stay stale-true
              // for the whole disconnected window (no reconnect banner, history treats realtime
              // as authoritative). `onAfterConnected` flips it back true on reconnect.
              platformSync.setConnected(false);
              // Connection status UI is handled by RealtimeConnectionBanner (no info toast).
            },
            onMessageFailed: (detail) => {
              browserEvents.dispatchEchoMessageFailed(detail);
            },
            onJoinChannelDenied: (payload) => {
              input.host.workspace.applyWorkspaceEvent({
                kind: 'permission_invalidated',
                version: `join-denied-${Date.now()}`,
              });
              const message =
                payload.code === 'NOT_FOUND'
                  ? 'This channel no longer exists.'
                  : 'You no longer have access to this channel.';
              dispatchAppToastDetail({
                title: 'Channel unavailable',
                message,
                severity: 'warning',
                durationMs: 6000,
              });
            },
          },
        };

        const uiTx = createUiTransactionManager();

        const presenceHeartbeat = createPresenceHeartbeatSession({
          getAdapter: () => transport.io.adapter as PresenceEmitAdapter,
          getSocketConnected: transport.getSocketConnected,
        });

        const bridge = createEchoRealtimeMessageStoreBridge({
          messages: input.messages,
          host: effectiveHost,
        });

        registerEchoRealtimeUiControllerTransactions({
          uiTx,
          host: effectiveHost,
          cleanupOptimisticSend: bridge.cleanupOptimisticSend,
        });

        registerDeferredMediaOutboundSend({
          getAuthorId: () => input.currentUserId.value,
          socketOff: transport.socketOff,
          isSocketConnected: transport.getSocketConnected,
          getAdapter: () => transport.io.adapter,
          appendChannelMessage: bridge.appendChannelMessage,
          cleanupOptimisticSend: bridge.cleanupOptimisticSend,
          pendingSentMessages: bridge.pendingSentMessages,
          uiTx,
          getLocalAuthorEcho: input.getLocalAuthorEcho,
          dispatchEchoMessageFailed: (detail) =>
            browserEvents.dispatchEchoMessageFailed(detail),
        });

        const sendMessage = createEchoSocketSendMessage({
          getAuthorId: () => input.currentUserId.value,
          socketOff: transport.socketOff,
          isSocketConnected: transport.getSocketConnected,
          getAdapter: () => transport.io.adapter,
          appendChannelMessage: bridge.appendChannelMessage,
          rememberPendingSentMessage: bridge.rememberPendingSentMessage,
          uiTx,
          getLocalAuthorEcho: input.getLocalAuthorEcho,
          getDmPeerUserId: input.getDmPeerUserId,
          getAccessToken: input.getAccessToken,
        });

        const {
          submitPollVote,
          submitReactionToggle,
          submitPin,
          submitUnpin,
          submitMessageDelete,
          submitMessageEdit,
          submitImageSlotFill,
          submitDmCallInvite,
          submitDmCallAccept,
          submitDmCallEnd,
        } = createEchoSocketSubmitEmitters({
          tryEmitRealtime: transport.tryEmitRealtime,
          newCorrelationId,
        });

        function pushOutboundPresenceSnapshot(): void {
          if (!transport.getSocketConnected()) return;
          tryEmitPresenceSet(
            transport.io.adapter as PresenceEmitAdapter,
            true,
            input.getBackendUserStatus(),
            { fallbackIfUnspecified: 'online' },
          );
          const relay = resolveRelayablePresenceForOutbound(
            input.getBackendUserStatus(),
            'online',
          );
          presenceHeartbeat.start(relay);
        }

        const port = {
          sendMessage,
          submitPollVote,
          submitReactionToggle,
          isLiveReactionReady: () =>
            !transport.socketOff() &&
            !!(transport.io.socket?.connected && transport.io.adapter),
          isLiveSocketReady: () =>
            !transport.socketOff() &&
            !!(transport.io.socket?.connected && transport.io.adapter),
          uiTransactions: uiTx,
          submitPin,
          submitUnpin,
          submitMessageDelete,
          submitMessageEdit,
          submitImageSlotFill,
          submitDmCallInvite,
          submitDmCallAccept,
          submitDmCallEnd,
          /** Re-push `presence:set` + heartbeat when profile status hydrates after connect. */
          syncOutboundPresence: pushOutboundPresenceSnapshot,
        };

        const inboundRuntime = { connectErrorLogged: false };

        const chat = createEchoRealtimeChatIngestPort({
          messages: input.messages,
          pendingSentMessages: bridge.pendingSentMessages,
          host: effectiveHost,
          uiTx,
          resolveEchoAuthorId: bridge.resolveEchoAuthorId,
          appendChannelMessage: bridge.appendChannelMessage,
          removeMessageById: bridge.removeMessageById,
          cleanupOptimisticSend: bridge.cleanupOptimisticSend,
          notifyIncomingChatMessage: browserEvents.notifyIncomingChatMessage,
          applyRealtimeAuthorHint: effectiveHost.authorHints.applyAuthorHint,
          getViewerUserId: () => input.currentUserId.value,
          ensureReplyTargetMessage: input.ensureReplyTargetMessage,
        });

        const typing = createEchoRealtimeTypingIngestPort({
          host: effectiveHost,
          currentUserId: input.currentUserId,
        });

        const inboundListeners = createEchoSocketInboundListeners({
          host: effectiveHost,
          chat,
          typing,
          inboundRuntime,
          activeChannelId: () => input.activeChannelId.value,
        });

        return {
          port: port as unknown as import('@/services/realtime/echoRealtimePort').EchoRealtimePort,
          inboundListeners,
          onBeforeTeardown: () => {
            presenceHeartbeat.stop();
            registerChannelTypingSocketEmit(null);
            platformSync.setConnected(false);
            input.host.lifecycle.onSocketDisconnected();
          },
          onAfterConnected: (ctx) => {
            clearSocketXhrPollReloadGuard(browser);
            platformSync.setConnected(true);

            // Transport is up; app shell owns "join" policy.
            applyEchoSocketActiveChannelChange(
              transport.io,
              input.activeChannelId.value,
            );

            pushOutboundPresenceSnapshot();

            // Typing emit is a UI-driven concern; the socket layer only provides an adapter surface.
            registerChannelTypingSocketEmit((channelId) => {
              void transport.tryEmitRealtime((a) => {
                a.emit('channel:typing', { channelId });
              });
            });

            input.host.lifecycle.onSocketConnected({
              activeChannelId: ctx.activeChannelId ?? undefined,
              emitJoinChannel: ctx.rawSocketEmitJoinChannel,
              recovered: ctx.recovered,
            });
          },
          onAfterDisconnect: () => {
            // Keep error policy centralized; this just ensures we don't leave sync marked up.
            platformSync.setConnected(false);
          },
        };
      },
    }),
  };
}
