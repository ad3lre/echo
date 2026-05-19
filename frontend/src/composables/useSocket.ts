/**
 * Socket.IO connection for real-time chat.
 * Vue lifecycle shell for an already-assembled realtime wiring bundle.
 */

import { onMounted, onUnmounted, watch, type Ref } from 'vue';
import type { EchoRealtimePort } from '@/services/realtime/echoRealtimePort';
import { registerEchoSocketComposableEffects } from '@/services/realtime/echoSocketComposableEffects';
import type { EchoSocketRealtimeWiring } from '@/services/realtime/echoSocketRealtimeWiring';

export type { EchoRealtimePort };

export type UseSocketBinding = {
  activeChannelId: Ref<string>;
  getAuthKey: () => readonly [boolean, string | null | undefined];
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
