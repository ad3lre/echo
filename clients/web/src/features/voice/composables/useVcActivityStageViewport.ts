import { nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import type { VcActivityUiPhase } from '@/features/voice/vcActivityTypes';

/** Debounce before reacting to a resize-driven overflow (avoids thrashing the grid). */
const OVERFLOW_NARROW_DEBOUNCE_MS = 120;

/**
 * True when a nested scroll container under `root` overflows vertically while
 * still pinned to (near) the top — i.e. the activity content is cramped and the
 * channel column could give it room. Walks only into scrollable subtrees.
 */
export function activitySubtreeHasCrampedVerticalScroll(
  root: HTMLElement,
): boolean {
  const stack: HTMLElement[] = [root];
  while (stack.length) {
    const el = stack.pop()!;
    const stl = getComputedStyle(el);
    const oy = stl.overflowY;
    if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') {
      for (const c of el.children) {
        if (c instanceof HTMLElement) stack.push(c);
      }
      continue;
    }
    const overflowPx = el.scrollHeight - el.clientHeight;
    if (overflowPx > 14 && el.scrollTop <= 10) {
      return true;
    }
    for (const c of el.children) {
      if (c instanceof HTMLElement) stack.push(c);
    }
  }
  return false;
}

/** Native fullscreen for the activity stage root, with cleanup + exit-on-pick. */
export function useVcActivityFullscreen(
  stageRootRef: Ref<HTMLElement | null>,
  phase: () => VcActivityUiPhase,
) {
  const activityFullscreenActive = ref(false);

  function syncActivityFullscreenState() {
    const el = stageRootRef.value;
    activityFullscreenActive.value = !!el && document.fullscreenElement === el;
  }

  async function exitActivityFullscreenIfActive() {
    const el = stageRootRef.value;
    if (el && document.fullscreenElement === el) {
      try {
        await document.exitFullscreen();
      } catch {
        /* ignore */
      }
    }
  }

  async function toggleActivityFullscreen() {
    const el = stageRootRef.value;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      /* unsupported or denied */
    }
  }

  onMounted(() => {
    document.addEventListener('fullscreenchange', syncActivityFullscreenState);
  });
  onUnmounted(() => {
    document.removeEventListener(
      'fullscreenchange',
      syncActivityFullscreenState,
    );
    void exitActivityFullscreenIfActive();
  });

  watch(
    phase,
    (p) => {
      if (p === 'pick') void exitActivityFullscreenIfActive();
    },
    { immediate: true },
  );

  return { activityFullscreenActive, toggleActivityFullscreen };
}

type OverflowNarrowDeps = {
  phase: () => VcActivityUiPhase;
  isCompactShell: () => boolean;
  compactLayout: () => boolean;
  channelPanelCollapsed: () => boolean;
  /** Returns true when it narrowed a step; undefined when the host can't narrow. */
  narrowStep?: () => boolean;
};

/**
 * Desktop only: when activity content overflows vertically, nudge the channel
 * column narrower (one step) to give the stage room. No-op on compact shells.
 */
export function useVcActivityOverflowNarrow(
  stageRootRef: Ref<HTMLElement | null>,
  deps: OverflowNarrowDeps,
) {
  let ro: ResizeObserver | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  function teardown() {
    if (debounce) {
      clearTimeout(debounce);
      debounce = null;
    }
    if (ro) {
      ro.disconnect();
      ro = null;
    }
  }

  function schedule(root: HTMLElement) {
    if (deps.isCompactShell()) return;
    if (deps.compactLayout()) return;
    if (deps.channelPanelCollapsed()) return;
    if (deps.phase() === 'closed') return;
    const step = deps.narrowStep;
    if (!step) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      if (!activitySubtreeHasCrampedVerticalScroll(root)) return;
      step();
    }, OVERFLOW_NARROW_DEBOUNCE_MS);
  }

  watch(
    [
      stageRootRef,
      () => deps.phase(),
      () => deps.isCompactShell(),
      () => deps.compactLayout(),
      () => deps.channelPanelCollapsed(),
    ],
    () => {
      teardown();
      const root = stageRootRef.value;
      if (
        !root ||
        deps.phase() === 'closed' ||
        deps.isCompactShell() ||
        deps.compactLayout()
      ) {
        return;
      }
      if (!deps.narrowStep) return;

      ro = new ResizeObserver(() => schedule(root));
      ro.observe(root);
      void nextTick(() => schedule(root));
    },
    { flush: 'post' },
  );

  onUnmounted(teardown);
}
