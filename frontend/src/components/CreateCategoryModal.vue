<script setup lang="ts">
import { computed, ref, watch, toRef } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useAutofocusOnOpen } from '@/composables/useAutofocusOnOpen';

const props = defineProps<{
  modelValue: boolean;
  serverName: string;
  /** Existing category names (case-sensitive uniqueness). */
  existingCategoryNames: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: { name: string }];
}>();

const modalRef = ref<HTMLElement | null>(null);
const categoryNameInputRef = ref<HTMLInputElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

useAutofocusOnOpen(toRef(props, 'modelValue'), categoryNameInputRef);

const categoryName = ref('');

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    categoryName.value = '';
  },
);

const trimmedName = computed(() => categoryName.value.trim());
const nameIsDuplicate = computed(() =>
  props.existingCategoryNames.some((n) => n === trimmedName.value),
);

const canSubmit = computed(
  () => trimmedName.value.length > 0 && !nameIsDuplicate.value,
);

function close() {
  emit('update:modelValue', false);
}

function submit() {
  const name = trimmedName.value;
  if (!name || nameIsDuplicate.value) return;
  emit('submit', { name });
  emit('update:modelValue', false);
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-[150] flex items-center justify-center modal-overlay-bg px-4"
    @click.self="close"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-category-title"
      class="real-glass-modal relative w-full max-w-md rounded-xl p-6 text-foreground"
    >
      <h2 id="create-category-title" class="text-xl font-bold">
        Create category
      </h2>
      <p class="mt-1 text-sm text-fg-soft">
        Group channels in {{ serverName }}
      </p>

      <div class="mt-5">
        <label class="settings-label" for="create-category-input"
          >Category name</label
        >
        <div
          class="create-category-name-row mt-2 flex min-h-[44px] items-stretch overflow-hidden rounded-xl"
        >
          <input
            id="create-category-input"
            ref="categoryNameInputRef"
            v-model="categoryName"
            type="text"
            class="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder:text-fg-subtle"
            placeholder="New category"
            maxlength="100"
            @keydown.enter.prevent="submit"
          />
        </div>
        <p
          v-if="trimmedName && nameIsDuplicate"
          class="mt-2 text-xs text-rose-300/90"
        >
          A category with this name already exists.
        </p>
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg px-4 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-white"
          @click="close"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-indigo-500/90 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!canSubmit"
          @click="submit"
        >
          Create Category
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.modal-overlay-bg {
  background-color: var(--vue-auto-011);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.real-glass-modal {
  background: var(--chat-glass-bg-strong);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
}

.create-category-name-row {
  background: var(--vue-auto-026);
  backdrop-filter: blur(12px) saturate(1.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
}

.settings-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--vue-auto-042);
}
</style>
