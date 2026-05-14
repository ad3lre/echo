import { onMounted, onUnmounted, ref } from 'vue';

/**
 * True when the primary input is coarse (touch / stylus on glass).
 * Use to mirror hover-only UI for mobile without relying on :hover.
 */
export function useCoarsePointer() {
  const coarse = ref(false);

  function sync() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    coarse.value = window.matchMedia('(pointer: coarse)').matches;
  }

  let mq: MediaQueryList | null = null;
  let detach: (() => void) | null = null;

  onMounted(() => {
    mq = window.matchMedia('(pointer: coarse)');
    sync();
    const onChange = () => sync();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      detach = () => mq?.removeEventListener('change', onChange);
    } else {
      mq.addListener(onChange);
      detach = () => mq?.removeListener(onChange);
    }
  });

  onUnmounted(() => {
    detach?.();
    detach = null;
    mq = null;
  });

  return coarse;
}
