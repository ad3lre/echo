<script setup lang="ts">
/**
 * compact hover hints: after ~2s on the same target, show a styled tooltip.
 *
 * - `title="..."` on any element (global)
 * - `data-echo-hint="..."` when you need a hint without a native title
 * - `data-echo-hint-off` on an element to disable hints for it and its descendants
 *
 * While waiting or showing, `title` is stashed in `data-echo-title-stash` so the browser
 * does not show its own tooltip first.
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';

const HOVER_DELAY_MS = 2000;
const VIEWPORT_PAD = 8;
const GAP = 6;

const visible = ref(false);
const text = ref('');
const pos = ref({ left: 0, top: 0, transform: 'translate(-50%, 0)' });
const tooltipRef = ref<HTMLElement | null>(null);

let timer: ReturnType<typeof setTimeout> | null = null;
/** Element we are holding the delayed hint for (title may be stashed on it). */
let hintAnchorEl: Element | null = null;
let scheduledLabel = '';
let lastClientX = 0;
let lastClientY = 0;

const tooltipStyle = computed(() => ({
  left: `${pos.value.left}px`,
  top: `${pos.value.top}px`,
  transform: pos.value.transform,
}));

function resolveHint(
  from: EventTarget | null,
): { el: Element; label: string } | null {
  if (!from || !(from instanceof Element)) return null;
  if (from.closest('[data-echo-hint-off]')) return null;

  const dataHint = from.closest('[data-echo-hint]');
  if (dataHint) {
    const raw = dataHint.getAttribute('data-echo-hint');
    if (raw?.trim()) return { el: dataHint, label: raw.trim() };
  }

  const titled = from.closest('[title]');
  if (titled) {
    const t = titled.getAttribute('title')?.trim();
    if (t) return { el: titled, label: t };
  }

  return null;
}

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function restoreTitleOn(el: Element | null) {
  if (!el?.isConnected) return;
  if (!el.hasAttribute('data-echo-title-stash')) return;
  el.setAttribute('title', el.getAttribute('data-echo-title-stash') ?? '');
  el.removeAttribute('data-echo-title-stash');
}

function hide() {
  clearTimer();
  restoreTitleOn(hintAnchorEl as Element | null);
  hintAnchorEl = null;
  scheduledLabel = '';
  visible.value = false;
  text.value = '';
}

function placeTooltip() {
  const anchor = hintAnchorEl;
  const tip = tooltipRef.value;
  if (!anchor?.isConnected || !tip) return;

  const ar = anchor.getBoundingClientRect();
  const tr = tip.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = ar.bottom + GAP;
  if (top + tr.height > vh - VIEWPORT_PAD) {
    const above = ar.top - GAP - tr.height;
    if (above >= VIEWPORT_PAD) {
      top = above;
    } else {
      top = Math.max(
        VIEWPORT_PAD,
        Math.min(top, vh - VIEWPORT_PAD - tr.height),
      );
    }
  }

  const centerX = ar.left + ar.width / 2;
  const halfW = tr.width / 2;
  const left = Math.min(
    Math.max(centerX, VIEWPORT_PAD + halfW),
    vw - VIEWPORT_PAD - halfW,
  );

  pos.value = {
    left,
    top,
    transform: 'translate(-50%, 0)',
  };
}

function verifyPointerStillOverAnchor(anchor: Element): boolean {
  const top = document.elementFromPoint(lastClientX, lastClientY);
  if (!top || !(top instanceof Element)) return false;
  const hit = resolveHint(top);
  return !!hit && hit.el === anchor;
}

function scheduleShow(anchor: Element, label: string) {
  clearTimer();

  if (hintAnchorEl && hintAnchorEl !== anchor) {
    restoreTitleOn(hintAnchorEl);
  }

  hintAnchorEl = anchor;
  scheduledLabel = label;

  if (anchor.hasAttribute('title')) {
    anchor.setAttribute(
      'data-echo-title-stash',
      anchor.getAttribute('title') ?? '',
    );
    anchor.removeAttribute('title');
  }

  timer = setTimeout(() => {
    timer = null;
    if (!anchor.isConnected || hintAnchorEl !== anchor) {
      hide();
      return;
    }
    if (!verifyPointerStillOverAnchor(anchor)) {
      hide();
      return;
    }

    text.value = scheduledLabel;
    visible.value = true;
    void nextTick(() => {
      placeTooltip();
    });
  }, HOVER_DELAY_MS);
}

function onPointerOverCapture(e: PointerEvent) {
  if (e.pointerType === 'touch') return;
  lastClientX = e.clientX;
  lastClientY = e.clientY;

  const hit = resolveHint(e.target);
  if (!hit) {
    clearTimer();
    if (hintAnchorEl && !visible.value) {
      restoreTitleOn(hintAnchorEl);
      hintAnchorEl = null;
      scheduledLabel = '';
    }
    if (visible.value) hide();
    return;
  }

  if (visible.value && hintAnchorEl === hit.el) return;

  if (hintAnchorEl === hit.el && timer) return;

  if (visible.value) hide();

  scheduleShow(hit.el, hit.label);
}

function onPointerOutCapture(e: PointerEvent) {
  if (e.pointerType === 'touch') return;
  const hit = resolveHint(e.target);
  if (!hit) return;
  const to = e.relatedTarget as Node | null;
  if (to && hit.el.contains(to)) return;
  hide();
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerType === 'touch') return;
  lastClientX = e.clientX;
  lastClientY = e.clientY;
  if (visible.value && hintAnchorEl?.isConnected) {
    if (!verifyPointerStillOverAnchor(hintAnchorEl)) {
      hide();
      return;
    }
    placeTooltip();
  }
}

function onScrollOrResize() {
  if (visible.value) placeTooltip();
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value) {
    e.stopPropagation();
    hide();
  }
}

function onPointerLeaveDoc() {
  hide();
}

onMounted(() => {
  document.addEventListener('pointerover', onPointerOverCapture, true);
  document.addEventListener('pointerout', onPointerOutCapture, true);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);
  document.addEventListener('keydown', onKeyDown, true);
  document.documentElement.addEventListener('pointerleave', onPointerLeaveDoc);
});

onUnmounted(() => {
  document.removeEventListener('pointerover', onPointerOverCapture, true);
  document.removeEventListener('pointerout', onPointerOutCapture, true);
  document.removeEventListener('pointermove', onPointerMove, true);
  document.removeEventListener('scroll', onScrollOrResize, true);
  window.removeEventListener('resize', onScrollOrResize);
  document.removeEventListener('keydown', onKeyDown, true);
  document.documentElement.removeEventListener(
    'pointerleave',
    onPointerLeaveDoc,
  );
  hide();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-show="visible"
      ref="tooltipRef"
      role="tooltip"
      class="echo-hover-hint pointer-events-none fixed z-[100000] max-w-[min(280px,calc(100vw-16px))] rounded-md border border-border/70 bg-elevated px-2.5 py-1.5 text-left text-[12px] leading-snug text-foreground shadow-[0_4px_24px_rgba(0,0,0,0.45)]"
      :style="tooltipStyle"
    >
      <span class="block whitespace-pre-wrap break-words">{{ text }}</span>
    </div>
  </Teleport>
</template>
