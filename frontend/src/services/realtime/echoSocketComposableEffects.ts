import type { Ref, onMounted, onUnmounted, watch } from 'vue';
import type {
  EchoSocketAuthKey,
  EchoSocketIoState,
} from '@/services/realtime/echoSocketSessionLifecycle';
import {
  applyEchoSocketActiveChannelChange,
  shouldRecycleEchoSocketOnAuthChange,
} from '@/services/realtime/echoSocketSessionLifecycle';

export type EchoSocketVueEffectHooks = {
  onMounted: typeof onMounted;
  onUnmounted: typeof onUnmounted;
  watch: typeof watch;
};

/** Registers `onMounted`, channel + auth `watch`, and `onUnmounted` for the realtime port (call from `useSocket` setup). */
export function registerEchoSocketComposableEffects(
  vue: EchoSocketVueEffectHooks,
  p: {
    activeChannelId: Ref<string>;
    getAuthKey: () => EchoSocketAuthKey;
    io: EchoSocketIoState;
    socketOff: () => boolean;
    connectSocket: () => Promise<void>;
    teardownSocket: () => void;
    mountWindowAndIdle: () => void;
    disposeSocketComposable: () => void;
  },
): void {
  vue.onMounted(() => {
    if (!p.getAuthKey()[0]) return;
    p.mountWindowAndIdle();
  });

  vue.watch(p.activeChannelId, (id) => {
    applyEchoSocketActiveChannelChange(p.io, id);
  });

  vue.watch(
    () => p.getAuthKey(),
    (next, prev) => {
      if (p.socketOff()) return;
      if (!shouldRecycleEchoSocketOnAuthChange(next, prev)) return;
      p.teardownSocket();
      if (!next[0]) {
        // No authenticated user: fully dispose listeners so resume/page events
        // cannot keep reconnecting and spamming disconnected banners.
        p.disposeSocketComposable();
        return;
      }
      if (!prev?.[0]) {
        p.mountWindowAndIdle();
      }
      void p.connectSocket();
    },
  );

  vue.onUnmounted(() => p.disposeSocketComposable());
}
