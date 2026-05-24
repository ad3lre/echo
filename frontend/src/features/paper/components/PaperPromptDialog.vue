<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  error?: string | null;
}>();

const emit = defineEmits<{
  confirm: [value: string];
  cancel: [];
}>();

const draft = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    draft.value = props.initialValue ?? '';
    void nextTick(() => inputRef.value?.focus());
  },
);

function onSubmit() {
  emit('confirm', draft.value.trim());
}

function onBackdrop() {
  emit('cancel');
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[160] flex items-center justify-center modal-overlay-bg px-4"
    @mousedown.self="onBackdrop"
  >
    <form
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      class="w-full max-w-md rounded-xl border border-border bg-elevated p-4 shadow-xl"
      @submit.prevent="onSubmit"
    >
      <h2 class="text-sm font-semibold text-fg">{{ title }}</h2>
      <label class="mt-3 block text-xs text-fg-soft">{{ label }}</label>
      <input
        ref="inputRef"
        v-model="draft"
        type="text"
        class="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
        :placeholder="placeholder"
      />
      <p v-if="error" class="mt-2 text-xs text-red-400">{{ error }}</p>
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 text-sm text-fg-soft hover:bg-glass-hover"
          @click="onBackdrop"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          {{ confirmLabel ?? 'Apply' }}
        </button>
      </div>
    </form>
  </div>
</template>
