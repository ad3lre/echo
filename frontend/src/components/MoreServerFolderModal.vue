<script setup lang="ts">
import { ref, watch, computed, toRef } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useAutofocusOnOpen } from '@/composables/useAutofocusOnOpen';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    mode: 'create' | 'edit';
    initialName?: string;
    serverCount?: number;
  }>(),
  {
    initialName: '',
    serverCount: 0,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [name: string];
  delete: [];
}>();

const name = ref('');
const confirmDelete = ref(false);
const modalRef = ref<HTMLElement | null>(null);
const nameInputRef = ref<HTMLInputElement | null>(null);

useFocusTrap(modalRef, toRef(props, 'modelValue'));
useAutofocusOnOpen(toRef(props, 'modelValue'), nameInputRef);

const title = computed(() =>
  props.mode === 'create' ? 'New widget folder' : 'Edit widget folder',
);

const subtitle = computed(() =>
  props.mode === 'create'
    ? 'Group Extra servers on this device. Drag icons to reorder, or right-click in compact view to assign servers.'
    : 'Rename or delete this folder. Guild memberships are unchanged — only this local grouping is removed.',
);

watch(
  () => [props.modelValue, props.mode, props.initialName] as const,
  ([open]) => {
    if (!open) return;
    name.value = props.initialName?.trim() || 'New folder';
    confirmDelete.value = false;
  },
  { immediate: true },
);

function close() {
  emit('update:modelValue', false);
}

function submitSave() {
  const n = name.value.trim();
  if (!n) return;
  emit('save', n);
  close();
}

function submitDelete() {
  if (!confirmDelete.value) {
    confirmDelete.value = true;
    return;
  }
  emit('delete');
  close();
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[210] flex items-center justify-center modal-overlay-bg p-4"
      @click.self="close"
    >
      <div
        ref="modalRef"
        role="dialog"
        aria-modal="true"
        class="more-server-folder-modal real-glass-modal relative w-full max-w-md rounded-xl p-6 text-foreground"
        @click.stop
      >
        <h2 class="text-xl font-bold tracking-tight text-fg">{{ title }}</h2>
        <p class="mt-1.5 text-sm leading-relaxed text-fg-subtle">
          {{ subtitle }}
        </p>

        <label class="mt-5 block">
          <span
            class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-fg-subtle"
          >
            Folder name
          </span>
          <input
            ref="nameInputRef"
            v-model="name"
            type="text"
            maxlength="48"
            class="msf-name-input w-full rounded-lg border border-border px-3 py-2.5 text-sm text-fg outline-none transition focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
            placeholder="e.g. Communities, Work, Favorites"
            @keydown.enter.prevent="submitSave"
          />
        </label>

        <p
          v-if="mode === 'edit' && serverCount > 0"
          class="mt-3 text-xs text-fg-subtle"
        >
          {{ serverCount }} server{{ serverCount === 1 ? '' : 's' }} in this
          folder — drag icons in the panel to add, remove, or reorder.
        </p>

        <div
          v-if="mode === 'edit' && confirmDelete"
          class="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-fg"
        >
          Delete “{{ initialName }}”? Servers stay in Extra servers; only the
          folder grouping is removed.
        </div>

        <div class="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button
            v-if="mode === 'edit'"
            type="button"
            class="msf-btn msf-btn--danger mr-auto"
            @click="submitDelete"
          >
            {{ confirmDelete ? 'Confirm delete' : 'Delete folder' }}
          </button>
          <button type="button" class="msf-btn msf-btn--ghost" @click="close">
            Cancel
          </button>
          <button
            type="button"
            class="msf-btn msf-btn--primary"
            :disabled="!name.trim()"
            @click="submitSave"
          >
            {{ mode === 'create' ? 'Create folder' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.modal-overlay-bg {
  background-color: var(--vue-auto-011);
  backdrop-filter: blur(12px) saturate(1.05);
  -webkit-backdrop-filter: blur(12px) saturate(1.05);
}

.real-glass-modal {
  background: var(--echo-modal-bg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-3);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
}

.msf-name-input {
  background: var(--echo-modal-bg-muted);
}

.msf-btn {
  border-radius: 8px;
  padding: 0.45rem 0.85rem;
  font-size: 0.8125rem;
  font-weight: 600;
  transition:
    background-color 0.15s ease-out,
    color 0.15s ease-out,
    border-color 0.15s ease-out;
}
.msf-btn--ghost {
  color: var(--vue-auto-049);
  background: transparent;
  border: 1px solid var(--vue-auto-002);
  &:hover {
    background: var(--vue-auto-001);
    color: var(--vue-auto-025);
  }
}
.msf-btn--primary {
  color: var(--vue-auto-044);
  background: var(--vue-auto-206);
  border: 1px solid var(--vue-auto-008);
  &:hover:not(:disabled) {
    background: var(--vue-auto-207);
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}
.msf-btn--danger {
  color: var(--vue-auto-210);
  background: transparent;
  border: 1px solid transparent;
  &:hover {
    background: var(--vue-auto-211);
    color: var(--vue-auto-068);
  }
}
</style>
