import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import type { EchoRealtimeHostPorts } from '@/features/layout/realtime/echoRealtimePort';
import { bindChannelMessageBuckets } from '@/features/chat/domain/channelMessageAuthority';
import { _resetAllIndexesForTesting } from '@/features/chat/domain/channelMessageIndex';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import { createEchoRealtimeMessageStoreBridge } from '@/features/chat/ingest/echoRealtimeMessageStoreBridge';
import type { EchoRealtimeIncomingChatPayload } from '@/features/chat/ingest/socketIncomingRawMessage';

function raw(
  partial: Partial<RawMessage> &
    Pick<RawMessage, 'id' | 'authorId' | 'timestamp' | 'content'>,
): RawMessage {
  return partial;
}

function createHostPorts(
  overrides?: Partial<EchoRealtimeHostPorts>,
): EchoRealtimeHostPorts {
  const base: EchoRealtimeHostPorts = {
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
  return { ...base, ...overrides };
}

describe('createEchoRealtimeMessageStoreBridge', () => {
  beforeEach(() => {
    _resetAllIndexesForTesting();
    messageWindowAuthority._resetForTesting();
  });

  it('appendChannelMessage inserts and calls onEchoChannelClientCap', () => {
    const onEchoChannelClientCap = vi.fn();
    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    const b = createEchoRealtimeMessageStoreBridge({
      messages,
      host: createHostPorts({
        clientCaps: { applyEchoChannelClientCap: onEchoChannelClientCap },
      }),
    });

    b.appendChannelMessage(
      'ch1',
      raw({
        id: 'm1',
        authorId: 'a1',
        timestamp: '2026-01-01T00:00:00.000Z',
        content: 'hello',
      }),
    );

    expect(messages.value.ch1).toHaveLength(1);
    expect(messages.value.ch1![0]!.id).toBe('m1');
    expect(onEchoChannelClientCap).toHaveBeenCalledWith('ch1');
  });

  it('removeMessageById drops row when present', () => {
    const messages = ref<Record<string, RawMessage[]>>({
      ch1: [
        raw({
          id: 'm1',
          authorId: 'a1',
          timestamp: '2026-01-01T00:00:00.000Z',
          content: 'a',
        }),
      ],
    });
    bindChannelMessageBuckets(messages);
    const b = createEchoRealtimeMessageStoreBridge({
      messages,
      host: createHostPorts(),
    });
    b.removeMessageById('ch1', 'm1');
    expect(messages.value.ch1).toEqual([]);
  });

  it('resolveEchoAuthorId uses pending client author when matched', () => {
    const messages = ref<Record<string, RawMessage[]>>({});
    bindChannelMessageBuckets(messages);
    const b = createEchoRealtimeMessageStoreBridge({
      messages,
      host: createHostPorts(),
    });
    b.rememberPendingSentMessage('ch1', 'cli-1', 'pending-author');

    const payload: EchoRealtimeIncomingChatPayload = {
      id: 'cli-1',
      channelId: 'ch1',
      authorId: 'server-author',
      content: '',
      timestamp: '2026-01-01T00:00:00.000Z',
    };

    expect(b.resolveEchoAuthorId(payload)).toBe('pending-author');
  });

  it('cleanupOptimisticSend removes message and pending entry', () => {
    const messages = ref<Record<string, RawMessage[]>>({
      ch1: [
        raw({
          id: 'cli-1',
          authorId: 'a1',
          timestamp: '2026-01-01T00:00:00.000Z',
          content: 'x',
        }),
      ],
    });
    bindChannelMessageBuckets(messages);
    const b = createEchoRealtimeMessageStoreBridge({
      messages,
      host: createHostPorts(),
    });
    b.rememberPendingSentMessage('ch1', 'cli-1', 'a1');

    b.cleanupOptimisticSend('ch1', 'cli-1');

    expect(messages.value.ch1).toEqual([]);
    expect(
      b.resolveEchoAuthorId({
        id: 'cli-1',
        channelId: 'ch1',
        authorId: 'fallback',
        content: '',
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe('fallback');
  });
});
