<script setup lang="ts">
import { computed } from 'vue';
import { normalizeEchoMessageFormatTemplateInput } from '@shared/messageChunkLimits';

const props = defineProps<{
  messageFormatTemplate?: string;
  messageFormatHard?: boolean;
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
</script>

<template>
  <div
    v-if="visible"
    class="composer-channel-format-banner mb-1.5 flex min-w-0 flex-col gap-1 rounded-md border border-border/50 bg-glass-1/80 px-2 py-1.5"
    role="status"
    aria-live="polite"
  >
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
      class="composer-channel-format-banner__preview max-h-16 min-w-0 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-fg"
      >{{ preview }}</pre
    >
  </div>
</template>
