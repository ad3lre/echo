import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { UseSocketBinding } from '@/composables/useSocket';
import type { EchoSocketRealtimeWiring } from '@/services/realtime/echoSocketRealtimeWiring';

const effectsMock = vi.hoisted(() => ({
  registerEchoSocketComposableEffects: vi.fn(),
}));

vi.mock('@/services/realtime/echoSocketComposableEffects', () => effectsMock);

import { useSocket } from './useSocket';

function createBinding(): UseSocketBinding {
  const port = {
    sendMessage: vi.fn(),
    submitPollVote: vi.fn(),
    submitReactionToggle: vi.fn(),
    isLiveReactionReady: vi.fn(),
    isLiveSocketReady: vi.fn(),
    uiTransactions: { id: 'ui-tx' },
    submitPin: vi.fn(),
    submitUnpin: vi.fn(),
    submitMessageDelete: vi.fn(),
    submitMessageEdit: vi.fn(),
    submitDmCallInvite: vi.fn(),
    submitDmCallAccept: vi.fn(),
    submitDmCallEnd: vi.fn(),
    syncOutboundPresence: vi.fn(),
  };

  const wiring = {
    port,
    io: { socket: null, adapter: null, lastChannelId: '' },
    socketOff: vi.fn(() => false),
    connectSocket: vi.fn(),
    teardownSocket: vi.fn(),
    disposeSocketComposable: vi.fn(),
    mountWindowAndIdle: vi.fn(),
  } as unknown as EchoSocketRealtimeWiring;

  return {
    activeChannelId: ref('channel-1'),
    getAuthKey: () => [true, 'token-1'] as const,
    wiring,
  };
}

describe('useSocket', () => {
  it('registers Vue lifecycle effects against the provided binding and returns the wiring port', () => {
    const binding = createBinding();

    const port = useSocket(binding);

    expect(port).toBe(binding.wiring.port);
    expect(
      effectsMock.registerEchoSocketComposableEffects,
    ).toHaveBeenCalledTimes(1);
    expect(
      effectsMock.registerEchoSocketComposableEffects,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        onMounted: expect.any(Function),
        onUnmounted: expect.any(Function),
        watch: expect.any(Function),
      }),
      expect.objectContaining({
        activeChannelId: binding.activeChannelId,
        getAuthKey: binding.getAuthKey,
        io: binding.wiring.io,
        socketOff: binding.wiring.socketOff,
        connectSocket: binding.wiring.connectSocket,
        teardownSocket: binding.wiring.teardownSocket,
        mountWindowAndIdle: binding.wiring.mountWindowAndIdle,
        disposeSocketComposable: binding.wiring.disposeSocketComposable,
      }),
    );
  });
});
