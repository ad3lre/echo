<script setup lang="ts">
import { computed } from 'vue';
import type { EchoAutomodRule } from '@shared/types/automod';
import { icons } from '@/assets/icons';
import {
  automodRuleIconGlyphFallback,
  automodRuleIconPickerUrl,
} from './automodRuleIcon';

const ACTION_LABEL: Record<string, string> = {
  block_message: 'Block',
  delete_recent_messages: 'Delete recent',
  timeout: 'Timeout',
  kick: 'Kick',
  ban: 'Ban',
  warn_user_dm: 'DM warn',
  alert_log_channel: 'Log alert',
  system_notice_in_channel: 'Channel notice',
  add_role: 'Add role',
  remove_role: 'Remove role',
};

const props = defineProps<{
  rule: EchoAutomodRule;
  canManage: boolean;
}>();

const emit = defineEmits<{
  edit: [];
  delete: [];
  'toggle-enabled': [enabled: boolean];
  'drag-start': [id: string];
  'drop-on': [targetId: string];
  'drag-end': [];
}>();

const summary = computed(() => {
  const parts = props.rule.actions.map(
    (a) => ACTION_LABEL[a.kind] ?? a.kind.replace(/_/g, ' '),
  );
  return parts.length ? parts.join(' · ') : 'No actions';
});

const hits = computed(() => props.rule.recentHitCount24h ?? 0);

const ruleIconImgSrc = computed(() =>
  automodRuleIconPickerUrl(props.rule.icon),
);

const ruleIconGlyph = computed(() =>
  automodRuleIconGlyphFallback(props.rule.icon),
);

function onGripDragStart(e: DragEvent) {
  if (!props.canManage) {
    e.preventDefault();
    return;
  }
  e.dataTransfer?.setData('text/plain', props.rule.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  emit('drag-start', props.rule.id);
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
}

function onDrop() {
  emit('drop-on', props.rule.id);
}
</script>

<template>
  <div
    class="flex items-stretch gap-0 overflow-hidden rounded-2xl border border-border/90 bg-glass-1 transition hover:border-border"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <button
      type="button"
      class="flex w-9 shrink-0 flex-col items-center justify-center border-r border-border/60 bg-glass-2/50 text-fg-subtle transition-colors hover:bg-glass-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="!canManage"
      draggable="true"
      aria-label="Drag to reorder rule"
      @dragstart="onGripDragStart"
      @dragend="$emit('drag-end')"
    >
      <span class="flex flex-col gap-0.5" aria-hidden="true">
        <span class="h-0.5 w-3.5 rounded-full bg-current opacity-60" />
        <span class="h-0.5 w-3.5 rounded-full bg-current opacity-60" />
        <span class="h-0.5 w-3.5 rounded-full bg-current opacity-60" />
      </span>
    </button>

    <div class="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 sm:px-4">
      <div
        v-if="ruleIconImgSrc"
        class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-surface p-0.5"
      >
        <img
          :src="ruleIconImgSrc"
          alt=""
          class="h-full w-full object-contain"
        />
      </div>
      <div
        v-else
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-indigo-500/15 text-lg leading-none"
        aria-hidden="true"
      >
        {{ ruleIconGlyph }}
      </div>

      <div class="min-w-0 flex-1">
        <div class="truncate text-[15px] font-semibold text-foreground">
          {{ rule.name }}
        </div>
        <div class="truncate text-xs text-fg-subtle">
          {{ summary }}
        </div>
      </div>

      <div
        class="hidden shrink-0 flex-col items-end justify-center text-right sm:flex"
      >
        <span class="text-lg font-semibold tabular-nums text-foreground">{{ hits }}</span>
        <span class="text-[10px] font-medium uppercase tracking-wide text-fg-soft">24h hits</span>
      </div>

      <label
        class="shrink-0"
        @click.stop
      >
        <input
          type="checkbox"
          class="server-toggle"
          :disabled="!canManage"
          :checked="rule.enabled"
          @change="
            emit(
              'toggle-enabled',
              ($event.target as HTMLInputElement).checked,
            )
          "
        />
      </label>

      <div class="flex shrink-0 items-center gap-1 border-l border-border/50 pl-2 sm:pl-3">
        <button
          type="button"
          class="rounded-lg p-2 text-fg-subtle transition-colors hover:bg-glass-hover hover:text-foreground disabled:opacity-40"
          :disabled="!canManage"
          aria-label="Edit rule"
          @click="emit('edit')"
        >
          <img
            :src="icons.pen"
            alt=""
            class="server-settings-inline-icon h-4 w-4 shrink-0 object-contain"
          />
        </button>
        <button
          type="button"
          class="rounded-lg p-2 text-fg-subtle transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:opacity-40"
          :disabled="!canManage"
          aria-label="Delete rule"
          @click="emit('delete')"
        >
          <img
            :src="icons.trash"
            alt=""
            class="server-settings-inline-icon h-4 w-4 shrink-0 object-contain"
          />
        </button>
      </div>
    </div>
  </div>
</template>
