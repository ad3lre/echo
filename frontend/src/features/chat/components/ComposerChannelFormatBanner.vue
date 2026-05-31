<script setup lang="ts">
import { computed, ref, watch, onUnmounted, nextTick } from 'vue';
import { normalizeEchoMessageFormatTemplateInput } from '@shared/messageChunkLimits';

const props = defineProps<{
  messageFormatTemplate?: string;
  messageFormatHard?: boolean;
  popoutDirection?: 'up' | 'down';
  closeOtherPopouts?: () => void;
}>();

const normalized = computed(() =>
  typeof props.messageFormatTemplate === 'string'
    ? normalizeEchoMessageFormatTemplateInput(props.messageFormatTemplate)
    : '',
);

const visible = computed(() => normalized.value.trim().length > 0);

const modeLabel = computed(() =>
  props.messageFormatHard === true ? 'Required format' : 'Default format',
);

const preview = computed(() => {
  const t = normalized.value;
  if (t.length <= 120) return t;
  return `${t.slice(0, 117)}…`;
});

const popoverOpen = ref(false);
const rootRef = ref<HTMLElement | null>(null);

function togglePopover() {
  const next = !popoverOpen.value;
  if (next) props.closeOtherPopouts?.();
  popoverOpen.value = next;
}

function closePopover() {
  popoverOpen.value = false;
}

defineExpose({ close: closePopover });

let popoverEscHandler: ((e: KeyboardEvent) => void) | null = null;
let popoverDocDown: ((e: MouseEvent) => void) | null = null;
let popoverOpenGen = 0;

watch(popoverOpen, (open) => {
  if (popoverEscHandler) {
    document.removeEventListener('keydown', popoverEscHandler);
    popoverEscHandler = null;
  }
  if (popoverDocDown) {
    document.removeEventListener('mousedown', popoverDocDown, true);
    popoverDocDown = null;
  }
  if (!open) {
    popoverOpenGen++;
    return;
  }
  const gen = popoverOpenGen;
  popoverEscHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePopover();
  };
  document.addEventListener('keydown', popoverEscHandler);
  void nextTick(() => {
    if (gen !== popoverOpenGen || !popoverOpen.value) return;
    popoverDocDown = (e: MouseEvent) => {
      const root = rootRef.value;
      if (root && !root.contains(e.target as Node)) closePopover();
    };
    document.addEventListener('mousedown', popoverDocDown, true);
  });
});

onUnmounted(() => {
  if (popoverEscHandler)
    document.removeEventListener('keydown', popoverEscHandler);
  if (popoverDocDown)
    document.removeEventListener('mousedown', popoverDocDown, true);
});
</script>

<template>
  <div v-if="visible" ref="rootRef" class="relative shrink-0">
    <button
      type="button"
      class="chat-focus-ring flex items-center justify-center rounded-md p-1 transition-all hover:scale-110 hover:bg-glass-hover"
      :class="
        popoverOpen
          ? 'bg-glass-2 text-foreground opacity-100'
          : 'text-fg-soft opacity-80'
      "
      :aria-expanded="popoverOpen"
      aria-haspopup="dialog"
      :aria-label="`${modeLabel}: view channel message format`"
      :title="modeLabel"
      @click.stop="togglePopover"
    >
      <svg
        class="h-6 w-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </button>
    <div
      v-if="popoverOpen"
      class="composer-channel-format-popover absolute right-0 z-[60] min-w-[240px] max-w-[min(320px,calc(100vw-2rem))] rounded-xl border border-border bg-elevated p-2.5 shadow-xl backdrop-blur-xl"
      :class="
        (popoutDirection ?? 'up') === 'down'
          ? 'top-full mt-1'
          : 'bottom-full mb-1'
      "
      role="dialog"
      :aria-label="modeLabel"
      @mousedown.prevent
      @click.stop
    >
      <div class="flex min-w-0 flex-col gap-1.5">
        <div class="flex min-w-0 items-center gap-2">
          <span
            class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            :class="
              messageFormatHard === true
                ? 'bg-amber-500/20 text-amber-100'
                : 'bg-glass-2 text-fg-soft'
            "
          >
            {{ modeLabel }}
          </span>
          <span class="min-w-0 truncate text-[11px] text-fg-soft">
            Channel message format is active
          </span>
        </div>
        <pre
          class="composer-channel-format-banner__preview max-h-32 min-w-0 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-fg"
          >{{ preview }}</pre
        >
      </div>
    </div>
  </div>
</template>
