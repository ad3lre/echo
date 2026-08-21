import { type Ref, computed, onMounted, onUnmounted, watch } from 'vue';
import {
  isBugHunterRecordingEnabled,
  pushBugHunterEntry,
} from '@/observability/bugHunterTrace';

/**
 * Records lightweight navigation / context when Bug Hunter is on (no router in this app).
 */
export function watchBugHunterAppContext(
  selectedServerId: Ref<string | undefined>,
  activeChannelId: Ref<string>,
): void {
  function pushSnapshot(reason: string) {
    if (!isBugHunterRecordingEnabled()) return;
    const pathname =
      typeof window !== 'undefined' ? window.location.pathname : '';
    pushBugHunterEntry({
      kind: 'app',
      event: 'context',
      meta: {
        reason,
        pathname,
        serverId: selectedServerId.value ?? '',
        channelId: activeChannelId.value ?? '',
      },
    });
  }

  const serverRef = computed(() => selectedServerId.value);
  const channelRef = computed(() => activeChannelId.value);

  const stop = watch([serverRef, channelRef], () => pushSnapshot('watch'), {
    immediate: true,
  });

  function onPopState() {
    pushSnapshot('popstate');
  }

  onMounted(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', onPopState);
    }
  });

  onUnmounted(() => {
    stop();
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', onPopState);
    }
  });
}
