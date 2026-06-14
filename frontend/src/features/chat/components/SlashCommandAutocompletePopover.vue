<script setup lang="ts">
import { computed, nextTick, ref, unref, watch } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import {
  slashCommandGroupLabel,
  type ChatSlashCommand,
  type SlashCommandGroup,
} from '@/features/chat/slashCommands/chatSlashCommands';

const props = defineProps<{
  suggestions:
    | ChatSlashCommand[]
    | Ref<ChatSlashCommand[]>
    | ComputedRef<ChatSlashCommand[]>;
  selectedIndex: number | Ref<number>;
  theme?: 'default' | 'forum';
}>();

const emit = defineEmits<{
  select: [command: ChatSlashCommand];
}>();

const scrollContainerRef = ref<HTMLElement | null>(null);

const suggestionList = computed(() =>
  Array.isArray(props.suggestions)
    ? props.suggestions
    : unref(props.suggestions),
);
const selectedIdx = computed(() =>
  typeof props.selectedIndex === 'number'
    ? props.selectedIndex
    : unref(props.selectedIndex),
);

function scrollSelectedIntoView() {
  const root = scrollContainerRef.value;
  if (!root) return;
  const btn = root.querySelector(
    `[data-slash-index="${String(selectedIdx.value)}"]`,
  ) as HTMLElement | null;
  btn?.scrollIntoView({ block: 'nearest' });
}

watch(selectedIdx, () => {
  void nextTick(scrollSelectedIntoView);
});

watch(suggestionList, () => {
  void nextTick(scrollSelectedIntoView);
});

function handleClick(command: ChatSlashCommand) {
  emit('select', command);
}

function groupForIndex(index: number): SlashCommandGroup | null {
  const list = suggestionList.value;
  const current = list[index]?.group;
  if (!current) return null;
  if (index === 0) return current;
  return list[index - 1]?.group === current ? null : current;
}
</script>

<template>
  <div
    v-if="suggestionList.length"
    ref="scrollContainerRef"
    class="slash-command-autocomplete-popover chat-liquid-glass-menu relative min-w-[240px] max-w-[320px] max-h-[min(360px,50vh)] overflow-y-auto py-1"
    role="listbox"
  >
    <template v-for="(command, i) in suggestionList" :key="command.id">
      <div
        v-if="groupForIndex(i)"
        class="slash-command-autocomplete-group px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle first:pt-1"
      >
        {{ slashCommandGroupLabel(groupForIndex(i)!) }}
      </div>
      <button
        type="button"
        role="option"
        :data-slash-index="i"
        :aria-selected="i === selectedIdx"
        class="slash-command-autocomplete-item chat-focus-ring flex w-full items-start gap-2 px-3 py-2 text-left transition-colors rounded-md"
        :class="{
          'slash-command-autocomplete-item--selected': i === selectedIdx,
        }"
        @mousedown.prevent
        @click="handleClick(command)"
      >
        <span
          class="slash-command-autocomplete-item__name mt-0.5 shrink-0 font-mono text-xs text-fg-subtle"
          >/{{ command.name }}</span
        >
        <span class="min-w-0 flex-1">
          <span
            class="block text-sm font-medium"
            :class="props.theme === 'forum' ? 'text-fg' : 'text-foreground'"
            >{{ command.label }}</span
          >
          <span
            class="mt-0.5 block text-[11px] leading-snug"
            :class="props.theme === 'forum' ? 'text-fg-soft' : 'text-muted'"
            >{{ command.description }}</span
          >
          <span
            v-if="command.preview"
            class="slash-command-autocomplete-item__preview mt-1 block truncate font-mono text-[10px] text-fg-subtle"
            >{{ command.preview }}</span
          >
        </span>
      </button>
    </template>
  </div>
</template>

<style scoped lang="scss">
.slash-command-autocomplete-item--selected {
  background-color: var(--glass-hover, rgb(255 255 255 / 0.08));
}
</style>
