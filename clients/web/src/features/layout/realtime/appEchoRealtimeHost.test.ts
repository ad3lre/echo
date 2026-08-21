import { describe, expect, it, vi } from 'vitest';
import { createAppLayoutEchoRealtimeHost } from '@/features/layout/realtime/appEchoRealtimeHost';

describe('createAppLayoutEchoRealtimeHost', () => {
  it('wires read state and pins into payload-shaped callbacks', () => {
    const mergeReadStateUpdate = vi.fn();
    const setPins = vi.fn();
    const host = createAppLayoutEchoRealtimeHost({
      onPresenceUpdate: vi.fn(),
      onDmActivity: vi.fn(),
      onDmCall: vi.fn(),
      onDmThreadActivity: vi.fn(),
      mergeReadStateUpdate,
      replaceAttentionSnapshot: vi.fn(),
      onEchoWorkspaceEvent: vi.fn(),
      setChannelPinsFromEcho: setPins,
      pinRollbackSync: { restorePinnedIds: vi.fn() },
      applyEchoChannelClientCap: vi.fn(),
      onSocketConnected: vi.fn(),
      onSocketDisconnected: vi.fn(),
      onConnectError: vi.fn(),
      onUnexpectedDisconnect: vi.fn(),
      onMessageFailed: vi.fn(),
      onJoinChannelDenied: vi.fn(),
      applyChannelTyping: vi.fn(),
      applyRealtimeAuthorHint: vi.fn(),
    });
    host.attention.applyReadStateUpdate({
      channelId: 'c1',
      lastReadMessageId: 'm9',
    });
    expect(mergeReadStateUpdate).toHaveBeenCalledWith('c1', 'm9', undefined);
    host.pins.applyChannelPinsUpdate({
      channelId: 'c2',
      messageIds: ['a', 'b'],
    });
    expect(setPins).toHaveBeenCalledWith('c2', ['a', 'b']);
  });
});
