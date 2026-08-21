/**
 * Socket.IO connection for real-time chat.
 * Vue lifecycle shell for an already-assembled realtime wiring bundle.
 */

import { onMounted, onUnmounted, watch, type Ref } from 'vue';
import type { EchoRealtimePort } from '@/features/layout/realtime/echoRealtimePort';
import { registerEchoSocketComposableEffects } from '@/features/layout/realtime/echoSocketComposableEffects';
import type { EchoSocketRealtimeWiring } from '@/features/layout/realtime/echoSocketRealtimeWiring';
import type { EchoSocketAuthKey } from '@/features/layout/realtime/echoSocketSessionLifecycle';

export type { EchoRealtimePort };

export type UseSocketBinding = {
  activeChannelId: Ref<string>;
  getAuthKey: () => EchoSocketAuthKey;
  wiring: EchoSocketRealtimeWiring;
};

export function useSocket(binding: UseSocketBinding): EchoRealtimePort {
  const {
    activeChannelId,
    getAuthKey,
    wiring: {
      port,
      io,
      socketOff,
      connectSocket,
      teardownSocket,
      disposeSocketComposable,
      mountWindowAndIdle,
    },
  } = binding;

  registerEchoSocketComposableEffects(
    { onMounted, onUnmounted, watch },
    {
      activeChannelId,
      getAuthKey,
      io,
      socketOff,
      connectSocket,
      teardownSocket,
      mountWindowAndIdle,
      disposeSocketComposable,
    },
  );

  return port;
}
