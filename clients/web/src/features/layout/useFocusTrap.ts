/**
 * Traps keyboard focus within a container (e.g. modal).
 * Tab cycles through focusable elements; Shift+Tab cycles backward.
 */

import { onUnmounted, watch, nextTick, type Ref } from 'vue';

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(
  containerRef: Ref<HTMLElement | null>,
  isActive: Ref<boolean>,
) {
  let previousActive: HTMLElement | null = null;

  function getFocusables(el: HTMLElement): HTMLElement[] {
    return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !containerRef.value) return;
    const focusables = getFocusables(containerRef.value);
    if (focusables.length === 0) return;

    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const target = e.target as HTMLElement;

    if (e.shiftKey) {
      if (target === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (target === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function activate() {
    void nextTick(() => {
      if (!containerRef.value) return;
      previousActive = document.activeElement as HTMLElement | null;
      const focusables = getFocusables(containerRef.value);
      if (focusables.length > 0) {
        focusables[0]!.focus();
      }
      document.addEventListener('keydown', handleKeydown);
    });
  }

  function deactivate() {
    document.removeEventListener('keydown', handleKeydown);
    previousActive?.focus();
    previousActive = null;
  }

  watch(
    isActive,
    (active) => {
      if (active) {
        activate();
      } else {
        deactivate();
      }
    },
    { immediate: true },
  );

  onUnmounted(deactivate);
}
