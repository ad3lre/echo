import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useContextMenuPosition } from '@/features/chat/composables/useContextMenuPosition';

/**
 * Lightweight right-click menu: position at cursor, close on outside click / Escape.
 */
export function useSimpleContextMenu() {
  const menuOpen = ref(false);
  const menuRef = ref<HTMLElement | null>(null);
  const { menuPosition, setMenuPositionFromPoint, fitMenuToViewport } =
    useContextMenuPosition();

  function closeMenu() {
    menuOpen.value = false;
  }

  async function openAtEvent(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    menuOpen.value = true;
    await nextTick();
    setMenuPositionFromPoint(e.clientX, e.clientY);
    await nextTick();
    requestAnimationFrame(() => {
      fitMenuToViewport(menuRef.value);
    });
  }

  function handleDocMouseDown(ev: MouseEvent) {
    const root = menuRef.value;
    if (root) {
      const path = ev.composedPath();
      if (path.includes(root)) return;
      for (const n of path) {
        if (n instanceof Node && root.contains(n)) return;
      }
    }
    closeMenu();
  }

  function handleKeydown(ev: KeyboardEvent) {
    if (ev.key === 'Escape') closeMenu();
  }

  onMounted(() => {
    document.addEventListener('mousedown', handleDocMouseDown);
    document.addEventListener('keydown', handleKeydown);
  });

  onUnmounted(() => {
    document.removeEventListener('mousedown', handleDocMouseDown);
    document.removeEventListener('keydown', handleKeydown);
  });

  return {
    menuOpen,
    menuRef,
    menuPosition,
    openAtEvent,
    closeMenu,
    fitMenuToViewport,
  };
}
