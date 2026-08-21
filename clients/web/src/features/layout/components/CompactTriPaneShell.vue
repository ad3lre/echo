<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { layoutHyperLog } from '@/features/layout/layoutHyperLog';
import { useCompactShellVisualViewportFrame } from '@/features/layout/composables/shell/useCompactShellVisualViewportFrame';

const props = defineProps<{
  modelValue: 0 | 1 | 2;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: 0 | 1 | 2];
}>();

const scroller = ref<HTMLElement | null>(null);
const { rootStyle, visualViewportWidthPx } =
  useCompactShellVisualViewportFrame();
let ignoreScrollEmit = false;
/** Skip redundant `scrollTo` when visual viewport events fire without changing scroller width. */
let lastVvResyncScrollerWidth: number | null = null;

/** Commit pane index after snap settles — avoids jittery mid-gesture `v-model` updates. */
const SCROLL_SETTLE_MS = 100;
let settleTimer: ReturnType<typeof setTimeout> | null = null;

function clearSettleTimer() {
  if (settleTimer) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
}

function commitPaneIndexFromScroll() {
  const el = scroller.value;
  if (!el) return;
  const w = el.clientWidth;
  if (w <= 0) return;
  const raw = Math.round(el.scrollLeft / w);
  const next = (raw < 0 ? 0 : raw > 2 ? 2 : raw) as 0 | 1 | 2;
  if (next !== props.modelValue) emit('update:modelValue', next);
}

/** Default `auto`: smooth horizontal scroll competes with chat layout work and reads stuttery on mid devices. */
function scrollToPane(index: 0 | 1 | 2, behavior: ScrollBehavior = 'auto') {
  const el = scroller.value;
  if (!el) return;
  const w = el.clientWidth;
  if (w <= 0) return;
  const targetLeft = w * index;
  if (Math.abs(el.scrollLeft - targetLeft) < 2) return;
  ignoreScrollEmit = true;
  el.scrollTo({ left: targetLeft, behavior });
  requestAnimationFrame(() => {
    ignoreScrollEmit = false;
  });
}

watch(
  () => props.modelValue,
  (v) => {
    layoutHyperLog('TriPane:pager', {
      index: v,
      surface: v === 0 ? 'left_channels' : v === 1 ? 'chat' : 'members',
    });
    scrollToPane(v);
  },
  { immediate: true },
);

watch(visualViewportWidthPx, () => {
  void nextTick(() => {
    const el = scroller.value;
    const w = el?.clientWidth ?? 0;
    if (w <= 0) return;
    if (lastVvResyncScrollerWidth !== null && lastVvResyncScrollerWidth === w) {
      return;
    }
    lastVvResyncScrollerWidth = w;
    scrollToPane(props.modelValue, 'auto');
  });
});

onUnmounted(() => {
  clearSettleTimer();
});

onMounted(() => {
  void nextTick(() => {
    const el = scroller.value;
    const r = el?.getBoundingClientRect();
    layoutHyperLog('TriPane:mount', {
      modelValue: props.modelValue,
      scrollerClientW: el?.clientWidth ?? null,
      scrollerClientH: el?.clientHeight ?? null,
      scrollW: el?.scrollWidth ?? null,
      rect: r
        ? {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
          }
        : null,
      vvW: visualViewportWidthPx.value,
    });
    scrollToPane(props.modelValue, 'auto');
  });
});

function onScroll() {
  if (ignoreScrollEmit) return;
  clearSettleTimer();
  settleTimer = setTimeout(() => {
    settleTimer = null;
    commitPaneIndexFromScroll();
  }, SCROLL_SETTLE_MS);
}

function onScrollEnd() {
  if (ignoreScrollEmit) return;
  clearSettleTimer();
  commitPaneIndexFromScroll();
}
</script>

<template>
  <div
    class="compact-tri-pane-root flex h-full min-h-0 min-w-0 flex-1 flex-col"
    :style="rootStyle"
  >
    <div
      ref="scroller"
      class="compact-tri-pane-scroll flex h-full min-h-0 min-w-0 flex-1 flex-row overflow-x-auto overflow-y-hidden overscroll-x-contain"
      style="scroll-snap-type: x mandatory"
      @scroll.passive="onScroll"
      @scrollend.passive="onScrollEnd"
    >
      <section
        class="compact-tri-pane-cell flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden"
        style="
          flex: 0 0 100%;
          scroll-snap-align: center;
          scroll-snap-stop: always;
        "
      >
        <slot name="left" />
      </section>
      <section
        class="compact-tri-pane-cell flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden"
        style="
          flex: 0 0 100%;
          scroll-snap-align: center;
          scroll-snap-stop: always;
        "
      >
        <div
          class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
          style="touch-action: pan-y"
        >
          <slot name="chat" />
        </div>
      </section>
      <section
        class="compact-tri-pane-cell flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden"
        style="
          flex: 0 0 100%;
          scroll-snap-align: center;
          scroll-snap-stop: always;
        "
      >
        <slot name="members" />
      </section>
    </div>
  </div>
</template>
