<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { EmojiInspectInfo } from '@/features/chat/emoji/resolveEmojiInspectInfo';

const CARD_WIDTH = 220;
const PAD = 8;
const GAP = 8;

const props = defineProps<{
  open: boolean;
  info: EmojiInspectInfo | null;
  triggerRect: DOMRect | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const cardRef = ref<HTMLElement | null>(null);
const cardStyle = ref<Record<string, string>>({
  left: `${PAD}px`,
  top: `${PAD}px`,
});

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function updateLayout() {
  const r = props.triggerRect;
  if (!props.open || !r || typeof window === 'undefined') return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const el = cardRef.value;
  const measuredW = el?.getBoundingClientRect().width ?? 0;
  const measuredH = el?.getBoundingClientRect().height ?? 0;
  const cw = measuredW > 8 ? measuredW : CARD_WIDTH;
  const ch = measuredH > 8 ? measuredH : 132;

  const cx = r.left + r.width / 2;
  let left = cx - cw / 2;
  let top = r.top - ch - GAP;
  if (top < PAD) top = r.bottom + GAP;
  left = clamp(left, PAD, vw - cw - PAD);
  top = clamp(top, PAD, vh - ch - PAD);

  cardStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
  };
}

watch(
  () => [props.open, props.triggerRect, props.info] as const,
  async () => {
    if (!props.open) return;
    await nextTick();
    updateLayout();
    requestAnimationFrame(updateLayout);
  },
  { immediate: true },
);

function onViewportChange() {
  if (props.open) updateLayout();
}

onMounted(() => {
  if (typeof window === 'undefined') return;
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, true);
});

onUnmounted(() => {
  if (typeof window === 'undefined') return;
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('scroll', onViewportChange, true);
});

const previewSizeClass = computed(() =>
  props.info?.kind === 'custom' ? 'h-14 w-14' : 'h-12 w-12',
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && info && triggerRect"
      ref="cardRef"
      class="emoji-inspect-card fixed z-[115] w-[220px] max-w-[calc(100vw-16px)] rounded-xl border border-border bg-[color-mix(in_srgb,var(--echo-popover-bg)_95%,transparent)] px-3 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-sm"
      :style="cardStyle"
      role="dialog"
      aria-label="Emoji details"
      data-echo-emoji-inspect-card
      @mousedown.stop
    >
      <div class="flex flex-col items-center gap-2 text-center">
        <span
          class="inline-flex items-center justify-center rounded-lg bg-glass-1"
          :class="previewSizeClass"
          v-html="info.previewHtml"
        />
        <div class="min-w-0 w-full space-y-0.5">
          <div
            class="truncate font-mono text-sm font-semibold text-foreground"
            :title="info.shortcode"
          >
            {{ info.shortcode }}
          </div>
          <div class="truncate text-xs text-fg-soft" :title="info.title">
            {{ info.title }}
          </div>
          <div
            v-if="info.subtitle"
            class="truncate text-[11px] text-fg-subtle"
            :title="info.subtitle"
          >
            {{ info.subtitle }}
          </div>
          <div
            v-if="info.animated"
            class="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle"
          >
            Animated
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.emoji-inspect-card :deep(.emoji) {
  width: 100% !important;
  height: 100% !important;
  max-width: 100% !important;
  max-height: 100% !important;
  object-fit: contain;
}
</style>
