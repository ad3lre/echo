<script setup lang="ts">
import { computed, ref } from 'vue';
import { exploreTagDisplayLabel } from '@/services/domain/exploreDirectoryRows';

const MAX_TAGS = 8;
const MAX_TAG_LEN = 32;
const SUGGESTION_LIMIT = 8;

const tags = defineModel<string[]>({ required: true });

const props = withDefaults(
  defineProps<{
    label: string;
    hint?: string;
    /** No focus ring on the chip container (flat shell). */
    flatChrome?: boolean;
    /** Popular Explore tags for autocomplete (canonical lowercase). */
    popularTags?: string[];
  }>(),
  { hint: '', flatChrome: false, popularTags: () => [] },
);
const emit = defineEmits<{
  blur: [];
}>();

const draft = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const inputFocused = ref(false);
const selectedSuggestionIndex = ref(0);

const canAddMore = computed(() => tags.value.length < MAX_TAGS);

const selectedSet = computed(() => new Set(tags.value));

const suggestions = computed(() => {
  const q = draft.value.trim().toLowerCase();
  const selected = selectedSet.value;
  const pool = props.popularTags.filter((tag) => tag && !selected.has(tag));
  const filtered = q
    ? pool.filter((tag) => tag.startsWith(q) || tag.includes(q))
    : pool;
  const ranked = [...filtered].sort((a, b) => {
    const aStarts = q && a.startsWith(q);
    const bStarts = q && b.startsWith(q);
    if (aStarts !== bStarts) return Number(bStarts) - Number(aStarts);
    return a.localeCompare(b);
  });
  return ranked.slice(0, SUGGESTION_LIMIT);
});

const showSuggestions = computed(
  () => inputFocused.value && canAddMore.value && suggestions.value.length > 0,
);

function normalizeOne(raw: string): string {
  return raw.trim().toLowerCase().slice(0, MAX_TAG_LEN);
}

/** @returns whether more tags may still be added */
function tryAddTag(raw: string): boolean {
  const t = normalizeOne(raw);
  if (!t) return canAddMore.value;
  if (!canAddMore.value) return false;
  if (tags.value.includes(t)) return true;
  tags.value = [...tags.value, t];
  return canAddMore.value;
}

function removeAt(index: number) {
  tags.value = tags.value.filter((_, i) => i !== index);
}

function pickSuggestion(tag: string) {
  tryAddTag(tag);
  draft.value = '';
  if (inputRef.value) inputRef.value.value = '';
  selectedSuggestionIndex.value = 0;
  inputRef.value?.focus();
}

function onKeydown(e: KeyboardEvent) {
  if (showSuggestions.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const max = suggestions.value.length - 1;
      selectedSuggestionIndex.value = Math.min(
        selectedSuggestionIndex.value + 1,
        max,
      );
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedSuggestionIndex.value = Math.max(
        selectedSuggestionIndex.value - 1,
        0,
      );
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      inputFocused.value = false;
      return;
    }
    if (e.key === 'Tab' && suggestions.value.length) {
      const pick = suggestions.value[selectedSuggestionIndex.value];
      if (pick) {
        e.preventDefault();
        pickSuggestion(pick);
        return;
      }
    }
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    if (showSuggestions.value && suggestions.value.length) {
      const pick =
        suggestions.value[selectedSuggestionIndex.value] ??
        suggestions.value[0];
      if (pick) {
        pickSuggestion(pick);
        return;
      }
    }
    tryAddTag(draft.value);
    draft.value = '';
    (e.target as HTMLInputElement).value = '';
    return;
  }
  if (e.key === 'Backspace' && !draft.value && tags.value.length) {
    e.preventDefault();
    removeAt(tags.value.length - 1);
  }
}

function onInput(e: Event) {
  const el = e.target as HTMLInputElement;
  const v = el.value;
  selectedSuggestionIndex.value = 0;
  if (!v.includes(',') && !v.includes('\n')) {
    draft.value = v;
    return;
  }
  const pieces = v.split(/[,\n]+/);
  const tail = pieces.pop() ?? '';
  for (const piece of pieces) {
    if (!tryAddTag(piece)) break;
  }
  draft.value = tail;
  el.value = tail;
}

function focusInput() {
  inputRef.value?.focus();
}

function onFocusin() {
  inputFocused.value = true;
}

function onFocusout(event: FocusEvent) {
  const currentTarget = event.currentTarget as HTMLElement | null;
  const nextTarget = event.relatedTarget as Node | null;
  if (currentTarget && nextTarget && currentTarget.contains(nextTarget)) return;
  inputFocused.value = false;
  emit('blur');
}
</script>

<template>
  <div class="relative">
    <label class="settings-label mb-2 block">{{ props.label }}</label>
    <div
      role="group"
      :aria-label="props.label"
      class="flex min-h-[2.75rem] flex-wrap items-center gap-1.5 rounded-xl bg-glass-1 px-2 py-2 transition-shadow"
      :class="
        props.flatChrome
          ? ''
          : 'focus-within:ring-2 focus-within:ring-accent/35'
      "
      @click="focusInput"
      @focusin="onFocusin"
      @focusout="onFocusout"
    >
      <span
        v-for="(tag, i) in tags"
        :key="`${tag}-${i}`"
        class="inline-flex max-w-full items-center gap-0.5 rounded-full bg-glass-2 py-0.5 pl-2.5 pr-1 text-xs font-medium text-foreground"
      >
        <span class="truncate">{{ tag }}</span>
        <button
          type="button"
          class="shrink-0 rounded-full px-1.5 py-0.5 text-muted transition-colors hover:bg-glass-hover hover:text-foreground"
          :aria-label="`Remove tag ${tag}`"
          @click.stop="removeAt(i)"
        >
          ×
        </button>
      </span>
      <input
        v-if="canAddMore"
        ref="inputRef"
        :value="draft"
        type="text"
        class="min-w-[6rem] flex-1 bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted"
        :placeholder="tags.length ? '' : 'Type a tag, then Enter'"
        autocomplete="off"
        role="combobox"
        :aria-expanded="showSuggestions"
        aria-autocomplete="list"
        @keydown="onKeydown"
        @input="onInput"
      />
      <span v-else class="px-1 py-1 text-xs text-muted"
        >Maximum {{ MAX_TAGS }} tags</span
      >
    </div>
    <div
      v-if="showSuggestions"
      class="echo-autocomplete-menu chat-liquid-glass-menu absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-xl py-1 shadow-lg"
      role="listbox"
    >
      <button
        v-for="(tag, i) in suggestions"
        :key="tag"
        type="button"
        role="option"
        :aria-selected="i === selectedSuggestionIndex"
        class="echo-autocomplete-item chat-focus-ring flex w-full items-center px-3 py-2 text-left text-sm text-foreground"
        :class="{
          'mention-autocomplete-item--selected': i === selectedSuggestionIndex,
        }"
        @mousedown.prevent
        @click="pickSuggestion(tag)"
      >
        {{ exploreTagDisplayLabel(tag) }}
      </button>
    </div>
    <p v-if="props.hint" class="mt-1 text-[11px] text-muted">
      {{ props.hint }}
    </p>
  </div>
</template>
