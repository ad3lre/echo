<script setup lang="ts">
import { computed, unref } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import type { MentionOption } from '@/composables/useMentionAutocomplete';
import { safeImageUrl } from '@/utils/safeImageUrl';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { isMessageAuthorOffline } from '@/utils/isOfflinePresence';

const props = defineProps<{
  suggestions:
    | MentionOption[]
    | Ref<MentionOption[]>
    | ComputedRef<MentionOption[]>;
  selectedIndex: number | Ref<number>;
  theme?: 'default' | 'forum';
}>();

const emit = defineEmits<{
  select: [option: MentionOption];
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

function handleClick(option: MentionOption) {
  emit('select', option);
}

function suggestionNameClass(option: MentionOption): string {
  if (option.special) {
    return 'text-foreground';
  }
  const offline = isMessageAuthorOffline(option.status);
  return offline ? 'text-muted' : 'text-foreground';
}

function suggestionSecondaryText(option: MentionOption): string {
  if (option.special) return '';
  const aliases = Array.isArray(option.aliases) ? option.aliases : [];
  const alias = aliases.find(
    (candidate) =>
      candidate.trim().length > 0 &&
      candidate.trim().toLowerCase() !== option.name.trim().toLowerCase(),
  );
  return alias ? `@${alias}` : '';
}
</script>

<template>
  <div
    class="mention-autocomplete-popover chat-liquid-glass-menu echo-autocomplete-menu relative min-w-[220px] py-1"
    role="listbox"
  >
    <button
      v-for="(option, i) in suggestionList"
      :key="option.id"
      type="button"
      role="option"
      :aria-selected="i === selectedIdx"
      class="mention-autocomplete-item echo-autocomplete-item chat-focus-ring flex w-full items-center gap-2 px-3 py-2 text-left text-sm rounded-md"
      :class="{ 'mention-autocomplete-item--selected': i === selectedIdx }"
      @mousedown.prevent
      @click="handleClick(option)"
    >
      <span
        v-if="option.special"
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/30 text-xs font-bold text-indigo-300"
      >
        @
      </span>
      <div
        v-else-if="option.avatar"
        class="relative h-6 w-6 shrink-0 overflow-hidden rounded-full"
      >
        <PausedGifAvatar
          :src="safeImageUrl(option.avatar)"
          :alt="option.name"
          :session-key="option.id"
          :img-class="
            isMessageAuthorOffline(option.status)
              ? 'rounded-full object-cover grayscale'
              : 'rounded-full object-cover'
          "
        />
      </div>
      <span
        v-else
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-elevated text-xs text-muted"
      >
        {{ option.name[0]?.toUpperCase() }}
      </span>
      <span class="min-w-0 flex-1">
        <span class="truncate block" :class="suggestionNameClass(option)">{{
          option.name
        }}</span>
        <span
          v-if="suggestionSecondaryText(option)"
          class="echo-autocomplete-item-secondary block truncate text-xs"
          >{{ suggestionSecondaryText(option) }}</span
        >
      </span>
    </button>
    <div
      v-if="suggestionList.length === 0"
      class="echo-autocomplete-empty px-3 py-2 text-sm"
      role="status"
      aria-live="polite"
    >
      No people found
    </div>
  </div>
</template>

<style scoped>
.mention-autocomplete-item--selected {
  background: var(--menu-item-selected-bg);
}
</style>
