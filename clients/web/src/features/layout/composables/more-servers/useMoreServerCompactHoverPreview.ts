import { ref, onUnmounted } from 'vue';
import type { MoreServersMockServer } from '@/features/layout/composables/more-servers/useMoreServers';

const HOVER_DELAY_MS = 2000;

export type CompactHoverAnchor = {
  left: number;
  top: number;
  height: number;
};

/**
 * Delayed hover preview for compact Extra-servers widgets (2s hold).
 */
export function useMoreServerCompactHoverPreview() {
  const previewServer = ref<MoreServersMockServer | null>(null);
  const previewAnchor = ref<CompactHoverAnchor | null>(null);
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;

  function clearHoverTimer() {
    if (hoverTimer != null) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  }

  function dismissPreview() {
    clearHoverTimer();
    previewServer.value = null;
    previewAnchor.value = null;
  }

  function anchorFromElement(el: HTMLElement): CompactHoverAnchor {
    const r = el.getBoundingClientRect();
    return { left: r.right + 10, top: r.top + r.height / 2, height: r.height };
  }

  function schedulePreview(server: MoreServersMockServer, el: HTMLElement) {
    clearHoverTimer();
    hoverTimer = setTimeout(() => {
      previewServer.value = server;
      previewAnchor.value = anchorFromElement(el);
    }, HOVER_DELAY_MS);
  }

  function onCompactServerPointerEnter(
    server: MoreServersMockServer,
    e: PointerEvent,
  ) {
    const el = e.currentTarget;
    if (!(el instanceof HTMLElement)) return;
    schedulePreview(server, el);
  }

  function onCompactServerPointerLeave() {
    dismissPreview();
  }

  function onCompactServerPointerDown() {
    dismissPreview();
  }

  function onCompactServerDragStart() {
    dismissPreview();
  }

  onUnmounted(() => {
    dismissPreview();
  });

  return {
    previewServer,
    previewAnchor,
    onCompactServerPointerEnter,
    onCompactServerPointerLeave,
    onCompactServerPointerDown,
    onCompactServerDragStart,
    dismissPreview,
  };
}
