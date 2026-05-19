import { ref, onMounted, onUnmounted } from 'vue';
import { COMPACT_SHELL_MEDIA_QUERY } from '@/config/compactShell';

function readCompactShellMatches(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia(COMPACT_SHELL_MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * True when the viewport is below the compact shell breakpoint (see `compactShell.ts`).
 * Initial value is read synchronously so the first paint uses the compact grid/shell
 * on narrow viewports (otherwise `isCompactShell` stayed false until `onMounted` and
 * the desktop multi-column grid could overflow/crush the channel column).
 */
export function useCompactShell() {
  const isCompactShell = ref(readCompactShellMatches());

  let mq: MediaQueryList | null = null;
  let removeListener: (() => void) | null = null;

  function sync() {
    if (!mq) return;
    isCompactShell.value = mq.matches;
  }

  onMounted(() => {
    try {
      mq = window.matchMedia(COMPACT_SHELL_MEDIA_QUERY);
      sync();
      const handler = () => sync();
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', handler);
        removeListener = () => mq!.removeEventListener('change', handler);
      } else {
        mq.addListener(handler);
        removeListener = () => mq!.removeListener(handler);
      }
    } catch {
      isCompactShell.value = false;
    }
  });

  onUnmounted(() => {
    removeListener?.();
    removeListener = null;
    mq = null;
  });

  return { isCompactShell };
}
