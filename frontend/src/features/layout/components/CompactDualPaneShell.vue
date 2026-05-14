<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useCompactShellVisualViewportFrame } from '@/composables/useCompactShellVisualViewportFrame';

const props = defineProps<{
  modelValue: 0 | 1;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: 0 | 1];
}>();

const scroller = ref<HTMLElement | null>(null);
const { rootStyle, visualViewportWidthPx } =
  useCompactShellVisualViewportFrame();
let ignoreScrollEmit = false;

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
  const width = el.clientWidth;
  if (width <= 0) return;
  const raw = Math.round(el.scrollLeft / width);
  const clamped = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  const next = (clamped >= 1 ? 0 : 1) as 0 | 1;
  if (next !== props.modelValue) emit('update:modelValue', next);
}

/**
 * Pane 0 = main content, pane 1 = left rail (servers / DMs / Explore).
 * DOM order is [rail, main] so a **rightward** swipe (scrollLeft → 0) reveals the rail;
 * a leftward swipe returns to Explore.
 */
function scrollToPane(index: 0 | 1, behavior: ScrollBehavior = 'auto') {
  const el = scroller.value;
  if (!el) return;
  const width = el.clientWidth;
  if (width <= 0) return;
  const left = index === 0 ? width : 0;
  /** Avoid redundant scroll calls when snap / user gesture already aligned the pager. */
  if (Math.abs(el.scrollLeft - left) < 2) return;
  ignoreScrollEmit = true;
  el.scrollTo({ left, behavior });
  requestAnimationFrame(() => {
    ignoreScrollEmit = false;
  });
}

watch(
  () => props.modelValue,
  (value) => {
    scrollToPane(value);
  },
  { immediate: true },
);

/** Width drives horizontal pager geometry; height-only updates (keyboard, chrome) must not re-scroll. */
watch(visualViewportWidthPx, () => {
  void nextTick(() => scrollToPane(props.modelValue, 'auto'));
});

onMounted(() => {
  /** Single sync after layout — duplicate `scrollTo` here caused extra main-thread work on surface open. */
  void nextTick(() => scrollToPane(props.modelValue, 'auto'));
});

onUnmounted(() => {
  clearSettleTimer();
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
    class="compact-dual-pane-root flex h-full min-h-0 min-w-0 flex-1 flex-col"
    :style="rootStyle"
  >
    <div
      ref="scroller"
      class="compact-dual-pane-scroll flex h-full min-h-0 min-w-0 flex-1 flex-row overflow-x-auto overflow-y-hidden overscroll-x-contain"
      style="scroll-snap-type: x mandatory"
      @scroll.passive="onScroll"
      @scrollend.passive="onScrollEnd"
    >
      <section
        class="compact-dual-pane-cell flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden"
        style="
          flex: 0 0 100%;
          scroll-snap-align: center;
          scroll-snap-stop: always;
        "
      >
        <slot name="rail" />
      </section>
      <section
        class="compact-dual-pane-cell flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden"
        style="
          flex: 0 0 100%;
          scroll-snap-align: center;
          scroll-snap-stop: always;
        "
      >
        <div class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <slot name="main" />
        </div>
      </section>
    </div>
  </div>
</template>
