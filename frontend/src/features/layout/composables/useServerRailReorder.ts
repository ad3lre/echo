import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { echoDevTrace } from '@/observability/echoDevTrace';
import {
  railDropBoundariesFromRects,
  railLineBeforeFromBoundariesSticky,
  railLineBeforeToToIndex,
  type RailSlotRect,
} from '@/utils/serverRailReorder';

/** Desktop rail: hold or deliberate move starts reorder (ms / px). */
const HOLD_MS = 200;
/** Movement from pointerdown before drag mode engages (trackpad clicks often jitter <10px). */
const DRAG_ACTIVATE_MOVE_PX = 10;
const HYSTERESIS_PX = 4;

function railFinalIndexAfterMove(n: number, from: number, to: number): number {
  const order = Array.from({ length: n }, (_, i) => i);
  const [x] = order.splice(from, 1);
  order.splice(to, 0, x);
  return order.indexOf(x);
}

function railToIndexForLineBefore(
  from: number,
  lineBefore: number,
  n: number,
): number | null {
  if (n < 2) return null;
  return railLineBeforeToToIndex(from, lineBefore, n);
}

function rectLike(r: DOMRect): RailSlotRect {
  return { top: r.top, right: r.right, bottom: r.bottom, left: r.left };
}

type Pending = {
  pointerId: number;
  index: number;
  startX: number;
  startY: number;
  folderRoot: HTMLElement;
  downTarget: HTMLElement;
  timer: ReturnType<typeof setTimeout>;
};

type Active = {
  pointerId: number;
  fromIndex: number;
  folderRoot: HTMLElement;
  captureEl: HTMLElement;
  /** True when drag mode started from the hold timer (not pointer jitter). */
  activatedViaHold: boolean;
};

export function useServerRailReorder(
  reorderEnabled: Ref<boolean>,
  visibleServersCount: Ref<number>,
  reorderVisibleServers?: (fromIndex: number, toIndex: number) => void,
  orientation:
    | Ref<'vertical' | 'horizontal'>
    | ComputedRef<'vertical' | 'horizontal'> = ref('vertical'),
  showExtraServersRailButton: Ref<boolean> = ref(false),
) {
  const railDragSourceIndex = ref<number | null>(null);
  /** Gap index 0..n where n = after last visible server (line before “more” or end). */
  const railDropLineBefore = ref<number | null>(null);
  /** Client coordinates for the floating drag ghost (viewport). */
  const railGhostPosition = ref<{ x: number; y: number } | null>(null);

  const suppressNextServerRailClick = ref(false);

  const isHorizontal = computed(() => orientation.value === 'horizontal');

  let pending: Pending | null = null;
  let active: Active | null = null;
  let windowListenersAttached = false;

  function clearPending() {
    if (pending) {
      clearTimeout(pending.timer);
      pending = null;
    }
  }

  function detachWindowDragListeners() {
    if (!windowListenersAttached) return;
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    window.removeEventListener('pointercancel', onWindowPointerCancel);
    windowListenersAttached = false;
  }

  function resetDragUi() {
    railDragSourceIndex.value = null;
    railDropLineBefore.value = null;
    railGhostPosition.value = null;
  }

  function attachWindowDragListeners() {
    if (windowListenersAttached) return;
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerCancel);
    windowListenersAttached = true;
  }

  function measureBoundaries(folderRoot: HTMLElement): number[] | null {
    const n = visibleServersCount.value;
    if (n <= 0) return null;
    const slots = Array.from(
      folderRoot.querySelectorAll<HTMLElement>('.server-folder__slot'),
    );
    if (slots.length < n) return null;
    const serverSlots = slots.slice(0, n);
    const slotRects = serverSlots.map((el) =>
      rectLike(el.getBoundingClientRect()),
    );
    let moreRect: RailSlotRect | null = null;
    if (showExtraServersRailButton.value && slots[n]) {
      moreRect = rectLike(slots[n]!.getBoundingClientRect());
    }
    return railDropBoundariesFromRects(slotRects, isHorizontal.value, moreRect);
  }

  function updateDropLine(clientX: number, clientY: number) {
    if (!active) return;
    const boundaries = measureBoundaries(active.folderRoot);
    if (!boundaries) return;
    const pos = isHorizontal.value ? clientX : clientY;
    railDropLineBefore.value = railLineBeforeFromBoundariesSticky(
      pos,
      boundaries,
      railDropLineBefore.value,
      HYSTERESIS_PX,
    );
    railGhostPosition.value = { x: clientX, y: clientY };
  }

  function commitReorder(fromIndex: number, lineBefore: number): boolean {
    if (!reorderVisibleServers) return false;
    const n = visibleServersCount.value;
    const to = railToIndexForLineBefore(fromIndex, lineBefore, n);
    echoDevTrace('server_rail_dnd.pointer_commit_resolve', {
      fromIndex,
      lineBefore,
      to: to ?? -1,
      n,
    });
    if (to === null) return false;
    if (railFinalIndexAfterMove(n, fromIndex, to) === fromIndex) return false;
    echoDevTrace('server_rail_dnd.reorder', { fromIndex, to });
    reorderVisibleServers(fromIndex, to);
    return true;
  }

  function tryActivate(
    fromPending: Pending,
    clientX: number,
    clientY: number,
    activatedViaHold: boolean,
  ) {
    clearPending();
    if (!reorderEnabled.value || !reorderVisibleServers) return;
    const fromIndex = fromPending.index;
    const capEl = fromPending.downTarget;
    active = {
      pointerId: fromPending.pointerId,
      fromIndex,
      folderRoot: fromPending.folderRoot,
      captureEl: capEl,
      activatedViaHold,
    };
    railDragSourceIndex.value = fromIndex;
    railDropLineBefore.value = null;
    railGhostPosition.value = { x: clientX, y: clientY };
    try {
      capEl.setPointerCapture(fromPending.pointerId);
    } catch (err) {
      echoDevTrace('server_rail_dnd.pointer_capture_error', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    updateDropLine(clientX, clientY);
    echoDevTrace('server_rail_dnd.pointer_activate', { fromIndex });
  }

  function onWindowPointerMove(e: PointerEvent) {
    if (pending && e.pointerId === pending.pointerId) {
      const dx = e.clientX - pending.startX;
      const dy = e.clientY - pending.startY;
      if (dx * dx + dy * dy >= DRAG_ACTIVATE_MOVE_PX * DRAG_ACTIVATE_MOVE_PX) {
        clearTimeout(pending.timer);
        const p = pending;
        pending = null;
        tryActivate(p, e.clientX, e.clientY, false);
      }
      return;
    }
    if (active && e.pointerId === active.pointerId) {
      updateDropLine(e.clientX, e.clientY);
    }
  }

  function onWindowPointerUp(e: PointerEvent) {
    if (pending && e.pointerId === pending.pointerId) {
      clearPending();
      detachWindowDragListeners();
      return;
    }
    if (active && e.pointerId === active.pointerId) {
      const fromIndex = active.fromIndex;
      const folderRoot = active.folderRoot;
      try {
        if (active.captureEl.hasPointerCapture(active.pointerId)) {
          active.captureEl.releasePointerCapture(active.pointerId);
        }
      } catch {
        /* ignore */
      }
      const activatedViaHold = active.activatedViaHold;
      active = null;
      detachWindowDragListeners();
      let didReorder = false;
      if (reorderEnabled.value && reorderVisibleServers) {
        const boundaries = measureBoundaries(folderRoot);
        if (boundaries) {
          const pos = isHorizontal.value ? e.clientX : e.clientY;
          const lineBefore = railLineBeforeFromBoundariesSticky(
            pos,
            boundaries,
            railDropLineBefore.value,
            HYSTERESIS_PX,
          );
          didReorder = commitReorder(fromIndex, lineBefore);
        }
      }
      // Trackpad/laptop clicks often jitter into drag mode; still switch server
      // unless the user held to reorder or actually changed rail order.
      suppressNextServerRailClick.value = activatedViaHold || didReorder;
      resetDragUi();
      echoDevTrace('server_rail_dnd.pointer_up', { fromIndex });
    }
  }

  function onWindowPointerCancel(e: PointerEvent) {
    if (pending && e.pointerId === pending.pointerId) {
      clearPending();
      detachWindowDragListeners();
      return;
    }
    if (active && e.pointerId === active.pointerId) {
      try {
        if (active.captureEl.hasPointerCapture(active.pointerId)) {
          active.captureEl.releasePointerCapture(active.pointerId);
        }
      } catch {
        /* ignore */
      }
      active = null;
      detachWindowDragListeners();
      resetDragUi();
      echoDevTrace('server_rail_dnd.pointer_cancel', {});
    }
  }

  function onRailServerPointerDown(payload: {
    event: PointerEvent;
    index: number;
    folderRoot: HTMLElement;
  }) {
    const { event: e, index, folderRoot } = payload;
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (!reorderEnabled.value || !reorderVisibleServers) return;
    echoDevTrace('server_rail_dnd.pointer_down', { index });
    onRailServerDragEnd();
    suppressNextServerRailClick.value = false;
    const target = e.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    const timer = setTimeout(() => {
      if (!pending || pending.pointerId !== e.pointerId) return;
      const p = pending;
      pending = null;
      tryActivate(p, e.clientX, e.clientY, true);
    }, HOLD_MS);
    pending = {
      pointerId: e.pointerId,
      index,
      startX: e.clientX,
      startY: e.clientY,
      folderRoot,
      downTarget: target,
      timer,
    };
    attachWindowDragListeners();
  }

  /** Full reset: pending/active, listeners, visuals. */
  function onRailServerDragEnd() {
    clearPending();
    if (active) {
      try {
        if (active.captureEl.hasPointerCapture(active.pointerId)) {
          active.captureEl.releasePointerCapture(active.pointerId);
        }
      } catch {
        /* ignore */
      }
      active = null;
    }
    detachWindowDragListeners();
    resetDragUi();
  }

  /** Returns true if the click should open/select the server; false if it was consumed. */
  function consumeRailSelectIntent(): boolean {
    if (suppressNextServerRailClick.value) {
      suppressNextServerRailClick.value = false;
      return false;
    }
    return true;
  }

  return {
    railDragSourceIndex,
    railDropLineBefore,
    railGhostPosition,
    onRailServerPointerDown,
    onRailServerDragEnd,
    consumeRailSelectIntent,
  };
}
