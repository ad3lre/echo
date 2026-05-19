<script setup lang="ts">
import { computed, ref } from 'vue';

const MAX_TAGS = 8;
const MAX_TAG_LEN = 32;

const tags = defineModel<string[]>({ required: true });

const props = withDefaults(
  defineProps<{
    label: string;
    hint?: string;
    /** No focus ring on the chip container (flat shell). */
    flatChrome?: boolean;
  }>(),
  { hint: '', flatChrome: false },
);
const emit = defineEmits<{
  blur: [];
}>();

const draft = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

const canAddMore = computed(() => tags.value.length < MAX_TAGS);

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

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
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

function onFocusout(event: FocusEvent) {
  const currentTarget = event.currentTarget as HTMLElement | null;
  const nextTarget = event.relatedTarget as Node | null;
  if (currentTarget && nextTarget && currentTarget.contains(nextTarget)) return;
  emit('blur');
}
</script>

<template>
  <div>
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
        @keydown="onKeydown"
        @input="onInput"
      />
      <span v-else class="px-1 py-1 text-xs text-muted"
        >Maximum {{ MAX_TAGS }} tags</span
      >
    </div>
    <p v-if="props.hint" class="mt-1 text-[11px] text-muted">
      {{ props.hint }}
    </p>
  </div>
</template>
