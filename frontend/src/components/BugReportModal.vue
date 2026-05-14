<script setup lang="ts">
import { ref, toRef, watch } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useAutofocusOnOpen } from '@/composables/useAutofocusOnOpen';
import { reportBug } from '@/features/bug-report/reportBug';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const modalRef = ref<HTMLElement | null>(null);
const description = ref('');
const descriptionInputRef = ref<HTMLTextAreaElement | null>(null);
const submitting = ref(false);
const errorMessage = ref<string | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

useAutofocusOnOpen(toRef(props, 'modelValue'), descriptionInputRef);

function close() {
  emit('update:modelValue', false);
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      description.value = '';
      errorMessage.value = null;
    }
  },
);

async function submit() {
  const text = description.value.trim();
  if (!text || submitting.value) return;
  submitting.value = true;
  errorMessage.value = null;
  try {
    await reportBug({ description: text });
    emit('update:modelValue', false);
  } catch (e) {
    errorMessage.value =
      e instanceof Error ? e.message : 'Could not submit report.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="bug-report-modal-overlay fixed inset-0 z-[170] flex items-center justify-center px-4 py-6"
      @click.self="close"
    >
      <div
        ref="modalRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-title"
        class="bug-report-modal-panel relative mx-auto w-full max-w-lg rounded-xl border border-[var(--border)] p-6 text-[var(--text)] shadow-[var(--shadow-3)]"
      >
        <div class="relative">
          <h2 id="bug-report-title" class="text-lg font-bold leading-tight">
            Report a bug
          </h2>
          <p class="mt-2 text-sm text-[var(--muted)]">
            Describe what went wrong. If Bug Hunter is enabled, recent technical
            traces are included automatically.
          </p>
          <textarea
            ref="descriptionInputRef"
            v-model="description"
            class="mt-4 w-full min-h-[120px] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
            placeholder="What happened? What did you expect?"
          />
          <p v-if="errorMessage" class="mt-3 text-sm text-rose-300">
            {{ errorMessage }}
          </p>
          <div
            class="mt-6 flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4"
          >
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--glass-tint)] hover:text-[var(--text)]"
              @click="close"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-indigo-600/85 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
              :disabled="submitting || !description.trim()"
              @click="submit"
            >
              {{ submitting ? 'Sending…' : 'Submit report' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.bug-report-modal-overlay {
  background-color: var(--overlay-dim);
}

.bug-report-modal-panel {
  background: var(--elevated);
}
</style>
