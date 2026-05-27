<script setup lang="ts">
import { computed, unref } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';
import type { EmojiEntry } from '@/composables/useEmojiData';
import { copyToClipboard } from '@/features/chat/composables/useMessageLinkActions';
import { useDevSettingsStore } from '@/stores/devSettings';
import { emojiPickerDevCopyValue } from '@/utils/emojiDevCopy';

const props = defineProps<{
  suggestions: EmojiEntry[] | Ref<EmojiEntry[]> | ComputedRef<EmojiEntry[]>;
  selectedIndex: number | Ref<number>;
  theme?: 'default' | 'forum';
}>();

const emit = defineEmits<{
  select: [emoji: string];
}>();

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

function handleClick(entry: EmojiEntry) {
  emit('select', entry.emoji);
}

const devSettings = useDevSettingsStore();
const { devModeIdsEnabled } = storeToRefs(devSettings);

function onSuggestionContextMenu(ev: MouseEvent, entry: EmojiEntry) {
  if (!devModeIdsEnabled.value) return;
  ev.preventDefault();
  ev.stopPropagation();
  copyToClipboard(emojiPickerDevCopyValue(entry));
}
</script>

<template>
  <div
    v-if="suggestionList.length"
    class="emoji-autocomplete-popover chat-liquid-glass-menu relative min-w-[160px] py-1"
    role="listbox"
  >
    <button
      v-for="(entry, i) in suggestionList"
      :key="
        entry.kind === 'appIcon'
          ? `appicon:${entry.iconFilename ?? entry.slug}`
          : entry.emoji + entry.slug
      "
      type="button"
      role="option"
      :aria-selected="i === selectedIdx"
      class="emoji-autocomplete-item chat-focus-ring flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors rounded-md"
      :class="{ 'emoji-autocomplete-item--selected': i === selectedIdx }"
      @mousedown.prevent
      @click="handleClick(entry)"
      @contextmenu="onSuggestionContextMenu($event, entry)"
    >
      <img
        v-if="entry.kind === 'custom' && entry.imageUrl"
        class="emoji custom-emoji h-5 w-5 object-contain"
        :src="entry.imageUrl"
        :alt="`:${entry.name}:`"
        draggable="false"
      />
      <span
        v-else
        class="text-xl leading-none emoji-wrap"
        v-html="entry.html"
      />
      <span
        class="truncate"
        :class="props.theme === 'forum' ? 'text-fg-soft' : 'text-muted'"
        >:{{ entry.slug }}:</span
      >
    </button>
  </div>
</template>

<style scoped>
/* Glass surface: .chat-liquid-glass-menu in main.scss */

.emoji-autocomplete-item:hover {
  background: var(--vue-auto-019);
}

.emoji-autocomplete-item--selected {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

.emoji-wrap :deep(.emoji) {
  height: 1.25em;
  width: 1.25em;
  vertical-align: -0.2em;
}
</style>
