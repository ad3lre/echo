import { onMounted, onUnmounted, ref } from 'vue';
import { COMPACT_GUILD_SPLIT_MEDIA_QUERY } from '@/config/compactShell';

function readCompactGuildSplitMatches(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia(COMPACT_GUILD_SPLIT_MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * True on compact viewports wide enough to show server rail + channel panel + chat at once
 * (see `COMPACT_GUILD_SPLIT_MIN_WIDTH_PX` in `compactShell.ts`).
 */
export function useCompactGuildSplitShell() {
  const isCompactGuildSplitShell = ref(readCompactGuildSplitMatches());

  let mq: MediaQueryList | null = null;
  let removeListener: (() => void) | null = null;

  function sync() {
    if (!mq) return;
    isCompactGuildSplitShell.value = mq.matches;
  }

  onMounted(() => {
    try {
      mq = window.matchMedia(COMPACT_GUILD_SPLIT_MEDIA_QUERY);
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
      isCompactGuildSplitShell.value = false;
    }
  });

  onUnmounted(() => {
    removeListener?.();
    removeListener = null;
    mq = null;
  });

  return { isCompactGuildSplitShell };
}
