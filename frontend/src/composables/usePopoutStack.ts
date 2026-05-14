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

  function handleClickOutside(e: MouseEvent) {
    if (wrapperRef.value && !wrapperRef.value.contains(e.target as Node)) {
      close();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && activePopout.value) {
      close();
    }
  }

  onMounted(() => {
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeydown);
  });

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside);
    document.removeEventListener('keydown', handleKeydown);
  });

  return {
    activePopout,
    wrapperRef,
    toggle,
    close,
  };
}
