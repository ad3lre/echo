import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { createUiTransactionManager } from '@/features/layout/uiTransactionManager';
import { registerEchoPendingClientMessageList } from '@/features/chat/ingest/echoPendingClientMessageRegistry';
import {
  isOutboundMessageSendPending,
  outboundSendPendingUiState,
  registerDeferredMediaOutboundSend,
  touchOutboundSendPendingUi,
} from '@/features/chat/send/deferredMediaOutboundSend';
import {
  PENDING_CLIENT_MESSAGE_MAX_AGE_MS,
  type PendingClientEchoMessage,
} from '@/features/chat/ingest/socketPendingClientMessages';
import { createEchoRealtimeChatIngestPort } from '@/features/chat/ingest/echoRealtimeChatIngest';
import { bindChannelMessageBuckets } from '@/features/chat/domain/channelMessageAuthority';
import { _resetAllIndexesForTesting } from '@/features/chat/domain/channelMessageIndex';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import { createEchoRealtimeMessageStoreBridge } from '@/features/chat/ingest/echoRealtimeMessageStoreBridge';
import type { EchoRealtimeHostPorts } from '@/features/layout/realtime/echoRealtimePort';

function createHostPorts(): EchoRealtimeHostPorts {
  return {
    presence: { applyPresenceUpdate: vi.fn() },
    dm: {
      applyDmActivity: vi.fn(),
      applyDmCall: vi.fn(),
      applyDmThreadActivity: vi.fn(),
    },
    attention: {
      applyReadStateUpdate: vi.fn(),
      applyAttentionSnapshot: vi.fn(),
    },
    workspace: { applyWorkspaceEvent: vi.fn() },
    pins: {
      applyChannelPinsUpdate: vi.fn(),
      pinRollbackSync: { restorePinnedIds: vi.fn() },
    },
    clientCaps: { applyEchoChannelClientCap: vi.fn() },
    lifecycle: { onSocketConnected: vi.fn(), onSocketDisconnected: vi.fn() },
    errors: {
      onConnectError: vi.fn(),
      onUnexpectedDisconnect: vi.fn(),
      onMessageFailed: vi.fn(),
      onJoinChannelDenied: vi.fn(),
    },
    typing: { applyChannelTyping: vi.fn() },
    authorHints: { applyAuthorHint: vi.fn() },
  };
}

describe('outbound send pending UI', () => {
  beforeEach(() => {
    _resetAllIndexesForTesting();
    messageWindowAuthority._resetForTesting();
    outboundSendPendingUiState.revision = 0;
  });

  it('treats stale pending entries as not pending without waiting for prune', () => {
    const pendingSentMessages: PendingClientEchoMessage[] = [
      {
        channelId: 'ch1',
        clientMessageId: 'cli-1',
        authorId: 'a1',
        createdAtMs: Date.now() - PENDING_CLIENT_MESSAGE_MAX_AGE_MS - 1,
      },
    ];
    registerEchoPendingClientMessageList(pendingSentMessages);
    registerDeferredMediaOutboundSend({
      getAuthorId: () => 'a1',
      socketOff: () => false,
      isSocketConnected: () => true,
      getAdapter: () => null,
      appendChannelMessage: vi.fn(),
      cleanupOptimisticSend: vi.fn(),
      pendingSentMessages,
      uiTx: createUiTransactionManager(),
      dispatchEchoMessageFailed: vi.fn(),
    });

    expect(isOutboundMessageSendPending('ch1', 'cli-1')).toBe(false);
  });

  it('clears pending UI when inbound message consumes optimistic send', () => {
    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    const uiTx = createUiTransactionManager();
    uiTx.register('message-send', {
      rollback: vi.fn(),
      commit() {
        touchOutboundSendPendingUi();
      },
    });

    const bridge = createEchoRealtimeMessageStoreBridge({
      messages,
      host: createHostPorts(),
    });

    registerDeferredMediaOutboundSend({
      getAuthorId: () => 'a1',
      socketOff: () => false,
      isSocketConnected: () => true,
      getAdapter: () => null,
      appendChannelMessage: bridge.appendChannelMessage,
      cleanupOptimisticSend: bridge.cleanupOptimisticSend,
      pendingSentMessages: bridge.pendingSentMessages,
      uiTx,
      dispatchEchoMessageFailed: vi.fn(),
    });

    const ingest = createEchoRealtimeChatIngestPort({
      messages,
      pendingSentMessages: bridge.pendingSentMessages,
      host: createHostPorts(),
      uiTx,
      resolveEchoAuthorId: bridge.resolveEchoAuthorId,
      appendChannelMessage: bridge.appendChannelMessage,
      removeMessageById: bridge.removeMessageById,
      cleanupOptimisticSend: bridge.cleanupOptimisticSend,
      notifyIncomingChatMessage: vi.fn(),
    });

    bridge.rememberPendingSentMessage('ch1', 'cli-1', 'a1');
    uiTx.beginTransaction({
      id: 'cli-1',
      type: 'message-send',
      state: 'pending',
      channelId: 'ch1',
      clientMessageId: 'cli-1',
    });
    bridge.appendChannelMessage('ch1', {
      id: 'cli-1',
      authorId: 'a1',
      timestamp: '2026-01-01T00:00:00.000Z',
      content: 'hello',
    });

    const revisionBeforeEcho = outboundSendPendingUiState.revision;
    expect(isOutboundMessageSendPending('ch1', 'cli-1')).toBe(true);

    ingest.onMessage({
      id: 'cli-1',
      channelId: 'ch1',
      authorId: 'server-author',
      content: 'hello',
      timestamp: '2026-01-01T00:00:01.000Z',
    });

    expect(outboundSendPendingUiState.revision).toBeGreaterThan(
      revisionBeforeEcho,
    );
    expect(isOutboundMessageSendPending('ch1', 'cli-1')).toBe(false);
    expect(uiTx.getPending('cli-1')).toBeUndefined();
  });

  it('clears pending UI when message_ack arrives before room broadcast echo', () => {
    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    const uiTx = createUiTransactionManager();
    uiTx.register('message-send', {
      rollback: vi.fn(),
      commit() {
        touchOutboundSendPendingUi();
      },
    });

    const bridge = createEchoRealtimeMessageStoreBridge({
      messages,
      host: createHostPorts(),
    });

    registerDeferredMediaOutboundSend({
      getAuthorId: () => 'a1',
      socketOff: () => false,
      isSocketConnected: () => true,
      getAdapter: () => null,
      appendChannelMessage: bridge.appendChannelMessage,
      cleanupOptimisticSend: bridge.cleanupOptimisticSend,
      pendingSentMessages: bridge.pendingSentMessages,
      uiTx,
      dispatchEchoMessageFailed: vi.fn(),
    });

    const ingest = createEchoRealtimeChatIngestPort({
      messages,
      pendingSentMessages: bridge.pendingSentMessages,
      host: createHostPorts(),
      uiTx,
      resolveEchoAuthorId: bridge.resolveEchoAuthorId,
      appendChannelMessage: bridge.appendChannelMessage,
      removeMessageById: bridge.removeMessageById,
      cleanupOptimisticSend: bridge.cleanupOptimisticSend,
      notifyIncomingChatMessage: vi.fn(),
    });

    bridge.rememberPendingSentMessage('ch1', 'cli-1', 'a1');
    uiTx.beginTransaction({
      id: 'cli-1',
      type: 'message-send',
      state: 'pending',
      channelId: 'ch1',
      clientMessageId: 'cli-1',
    });
    bridge.appendChannelMessage('ch1', {
      id: 'cli-1',
      authorId: 'a1',
      timestamp: '2026-01-01T00:00:00.000Z',
      content: 'hello',
    });

    expect(isOutboundMessageSendPending('ch1', 'cli-1')).toBe(true);

    ingest.onMessageAck({
      message: {
        id: 'cli-1',
        channelId: 'ch1',
        authorId: 'a1',
        content: 'hello',
        timestamp: '2026-01-01T00:00:01.000Z',
      },
    });

    expect(isOutboundMessageSendPending('ch1', 'cli-1')).toBe(false);
    expect(uiTx.getPending('cli-1')).toBeUndefined();
  });
});
