import { ref, watch, onBeforeUnmount } from 'vue';
import { livekitUnderlyingMediaStreamTrack } from '@/features/voice/livekitTrackMediaStream';

/**
 * Increments when the LiveKit track reference changes or the underlying
 * {@link MediaStreamTrack} fires `ended`, so video surfaces can re-run binding
 * and clear stale frames (wrapper objects are often reused by LiveKit).
 */
export function useLiveKitTrackSurfaceGeneration(getTrack: () => unknown) {
  const generation = ref(0);
  let detachEnded: (() => void) | undefined;

  function clearEndedListener() {
    detachEnded?.();
    detachEnded = undefined;
  }

  watch(
    getTrack,
    (t) => {
      clearEndedListener();
      generation.value++;
      const mst = livekitUnderlyingMediaStreamTrack(t);
      if (!mst) return;
      const onEnded = () => {
        generation.value++;
      };
      mst.addEventListener('ended', onEnded);
      detachEnded = () => mst.removeEventListener('ended', onEnded);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => clearEndedListener());

  return generation;
}
