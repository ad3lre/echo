<script setup lang="ts">
import { ref, toRef, watch } from 'vue';
import { icons } from '@/assets/icons';
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
    <Transition name="bug-overlay">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[170] flex items-center justify-center px-4 py-6 bg-overlay-dim backdrop-blur-sm"
        @click.self="close"
      >
        <Transition name="bug-card">
          <div
            v-if="modelValue"
            ref="modalRef"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bug-report-title"
            class="bug-report-card relative mx-auto w-full max-w-lg overflow-hidden rounded-3xl text-foreground"
            @click.stop
          >
            <div
              class="bug-top-accent pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-3xl"
              aria-hidden="true"
            />

            <button
              type="button"
              class="chat-focus-ring absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-glass-hover hover:text-foreground"
              aria-label="Close"
              :disabled="submitting"
              @click="close"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>

            <div class="relative px-6 pb-5 pt-6 pr-14">
              <div class="flex items-start gap-3">
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/25"
                  aria-hidden="true"
                >
                  <img
                    :src="icons.laptopCode"
                    alt=""
                    class="echo-ink-icon h-5 w-5 opacity-90"
                  />
                </span>
                <div class="min-w-0 flex-1">
                  <h2
                    id="bug-report-title"
                    class="text-lg font-bold leading-tight tracking-tight text-foreground"
                  >
                    Report a bug
                  </h2>
                  <p class="mt-0.5 text-sm leading-relaxed text-fg-subtle">
                    Describe what went wrong. If Bug Hunter is enabled, recent
                    technical traces are included automatically.
                  </p>
                </div>
              </div>

              <label class="mt-5 block">
                <span
                  class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                >
                  What happened?
                </span>
                <textarea
                  ref="descriptionInputRef"
                  v-model="description"
                  class="mt-2 w-full min-h-[120px] resize-y rounded-xl border border-border bg-scrim-1 px-3 py-2 text-sm text-foreground placeholder:text-fg-subtle focus:border-indigo-400/40 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
                  placeholder="What happened? What did you expect?"
                />
              </label>

              <p
                v-if="errorMessage"
                class="mt-3 text-sm text-rose-400"
                role="alert"
              >
                {{ errorMessage }}
              </p>
            </div>

            <div
              class="flex items-center justify-end gap-2 border-t border-border px-6 py-4"
            >
              <button
                type="button"
                class="rounded-lg px-4 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-foreground"
                :disabled="submitting"
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
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.bug-report-card {
  background: var(--echo-modal-bg);
  backdrop-filter: blur(24px) saturate(1.3);
  -webkit-backdrop-filter: blur(24px) saturate(1.3);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-4);
}

.bug-top-accent {
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, rgb(99 102 241) 18%, transparent) 0%,
    transparent 100%
  );
}

.bug-overlay-enter-active,
.bug-overlay-leave-active {
  transition: opacity 0.18s ease;
}
.bug-overlay-enter-from,
.bug-overlay-leave-to {
  opacity: 0;
}

.bug-card-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.34, 1.3, 0.64, 1);
}
.bug-card-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.bug-card-enter-from,
.bug-card-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(6px);
}
</style>
