/**
 * Directive: click-to-reveal for spoiler spans.
 * Add v-spoiler-reveal to the container that holds .spoiler elements.
 */

function spoilerHostFromEvent(e: MouseEvent): HTMLElement | null {
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
  for (const n of path) {
    if (n instanceof HTMLElement && n.classList.contains('spoiler')) {
      return n;
    }
  }
  const t = e.target;
  if (t instanceof HTMLElement && typeof t.closest === 'function') {
    return t.closest('.spoiler');
  }
  if (t instanceof Text && t.parentElement) {
    return t.parentElement.closest('.spoiler');
  }
  return null;
}

function interactiveInPath(
  e: MouseEvent,
  selector: string,
): HTMLElement | null {
  const t = e.target;
  if (t instanceof Element && typeof t.closest === 'function') {
    return t.closest(selector);
  }
  if (t instanceof Text && t.parentElement) {
    return t.parentElement.closest(selector);
  }
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
  for (const n of path) {
    if (n instanceof HTMLElement && n.closest) {
      const hit = n.closest(selector);
      if (hit instanceof HTMLElement) return hit;
    }
  }
  return null;
}

function handleClick(e: MouseEvent) {
  const target = spoilerHostFromEvent(e);
  if (!target) return;

  if (
    target.classList.contains('spoiler--media') &&
    target.classList.contains('spoiler--revealed') &&
    interactiveInPath(e, 'button:not([data-spoiler-hide]), a')
  ) {
    return;
  }
  target.classList.toggle('spoiler--revealed');
}

export const spoilerReveal = {
  mounted(el: HTMLElement) {
    el.addEventListener('click', handleClick);
    (el as HTMLElement & { _spoilerCleanup?: () => void })._spoilerCleanup =
      () => {
        el.removeEventListener('click', handleClick);
      };
  },
  unmounted(el: HTMLElement) {
    const cleanup = (el as HTMLElement & { _spoilerCleanup?: () => void })
      ._spoilerCleanup;
    cleanup?.();
  },
};
