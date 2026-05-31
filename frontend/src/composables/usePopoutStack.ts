/**
 * Manages a single active popout (emoji, gif, attach) with toggle, close, and click-outside.
 */

import { ref, onMounted, onUnmounted } from 'vue';

export type PopoutType = 'emoji' | 'gif' | 'attach' | null;

export function usePopoutStack() {
  const activePopout = ref<PopoutType>(null);
  const wrapperRef = ref<HTMLElement | null>(null);

  function toggle(type: PopoutType) {
    if (activePopout.value === type) {
      activePopout.value = null;
    } else {
      activePopout.value = type;
    }
  }

  function close() {
    activePopout.value = null;
  }

  function handlePointerDownOutside(e: MouseEvent) {
    const target = e.target;
    const el = target instanceof Element ? target : null;
    // Teleported chat popouts (GIF/image picker) are outside `wrapperRef`.
    if (el?.closest?.('[data-chat-insert-popout]')) return;
    if (wrapperRef.value?.contains(target as Node)) return;
    close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && activePopout.value) {
      close();
    }
  }

  onMounted(() => {
    document.addEventListener('mousedown', handlePointerDownOutside);
    document.addEventListener('keydown', handleKeydown);
  });

  onUnmounted(() => {
    document.removeEventListener('mousedown', handlePointerDownOutside);
    document.removeEventListener('keydown', handleKeydown);
  });

  return {
    activePopout,
    wrapperRef,
    toggle,
    close,
  };
}
