import { getCurrentInstance, onUnmounted, ref } from 'vue';

/**
 * Matches Tailwind `lg:` — `AppLayoutDmSidePanel` is `hidden lg:block` (1024px).
 * Below this width the inline DM profile rail is not in the layout; use
 * `ExpandedProfileModal` instead (`isExpandedProfileSidePanel === false`).
 */
const DM_PROFILE_SIDE_PANEL_MEDIA_QUERY = '(min-width: 1024px)';

function readCanShowSidePanel(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia(DM_PROFILE_SIDE_PANEL_MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

export function useDmProfileSidePanelLayout() {
  const canShowDmProfileSidePanel = ref(readCanShowSidePanel());

  let mq: MediaQueryList | null = null;
  let removeListener: (() => void) | null = null;

  function sync() {
    if (!mq) return;
    canShowDmProfileSidePanel.value = mq.matches;
  }

  function unbind() {
    removeListener?.();
    removeListener = null;
    mq = null;
  }

  if (typeof window !== 'undefined') {
    try {
      mq = window.matchMedia(DM_PROFILE_SIDE_PANEL_MEDIA_QUERY);
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
      canShowDmProfileSidePanel.value = false;
      unbind();
    }
  }

  if (getCurrentInstance()) {
    onUnmounted(unbind);
  }

  return { canShowDmProfileSidePanel };
}
