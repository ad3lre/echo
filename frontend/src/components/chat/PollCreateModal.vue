<script setup lang="ts">
import { ref, watch, toRef, computed } from 'vue';
import type { PollData, PollOption } from '@shared/types';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useAutofocusOnOpen } from '@/composables/useAutofocusOnOpen';
import { randomUuidV4 } from '@/utils/randomUuid';
import PollOptionEmojiPopover from './PollOptionEmojiPopover.vue';
import EchoDropdown from '@/components/EchoDropdown.vue';

const props = defineProps<{
  modelValue: boolean;
  serverId?: string;
  channelId?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  create: [poll: PollData];
}>();

const TIME_LIMIT_OPTIONS = [
  { value: '', label: 'No time limit' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 24 * 60, label: '1 day' },
  { value: 3 * 24 * 60, label: '3 days' },
  { value: 7 * 24 * 60, label: '1 week' },
] as const;

const timeLimitDropdownOptions = TIME_LIMIT_OPTIONS.map((opt) => ({
  value: opt.value === '' ? '' : String(opt.value),
  label: opt.label,
}));

const question = ref('');
const durationMinutes = ref<number | ''>('');
const durationMinutesModel = computed({
  get: () =>
    durationMinutes.value === '' ? '' : String(durationMinutes.value),
  set: (value: string) => {
    durationMinutes.value = value === '' ? '' : Number(value);
  },
});
const anonymousPoll = ref(false);
const options = ref<{ id: string; text: string; emoji: string }[]>([
  { id: randomUuidV4(), text: '', emoji: '' },
  { id: randomUuidV4(), text: '', emoji: '' },
]);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      question.value = '';
      durationMinutes.value = '';
      anonymousPoll.value = false;
      options.value = [
        { id: randomUuidV4(), text: '', emoji: '' },
        { id: randomUuidV4(), text: '', emoji: '' },
      ];
    }
  },
);

function close() {
  emit('update:modelValue', false);
}

function addOption() {
  if (options.value.length >= 10) return;
  options.value.push({ id: randomUuidV4(), text: '', emoji: '' });
}

function removeOption(id: string) {
  if (options.value.length <= 2) return;
  options.value = options.value.filter((o) => o.id !== id);
}

function handleSubmit() {
  const q = question.value.trim();
  const validOpts = options.value.filter((o) => o.text.trim().length > 0);
  if (!q || validOpts.length < 2) return;

  const mins = durationMinutes.value;
  const endsAt =
    typeof mins === 'number' && mins > 0
      ? new Date(Date.now() + mins * 60 * 1000).toISOString()
      : undefined;

  const poll: PollData = {
    question: q,
    options: validOpts.map(
      (o): PollOption => ({
        id: randomUuidV4(),
        text: o.text.trim(),
        emoji: o.emoji || undefined,
        votes: 0,
        voterIds: [],
      }),
    ),
    endsAt,
    ...(anonymousPoll.value ? { anonymous: true } : {}),
  };
  emit('create', poll);
  close();
}

const canSubmit = () => {
  const q = question.value.trim();
  const validOpts = options.value.filter((o) => o.text.trim().length > 0);
  return q.length > 0 && validOpts.length >= 2;
};

const modalRef = ref<HTMLElement | null>(null);
const pollQuestionInputRef = ref<HTMLInputElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

useAutofocusOnOpen(toRef(props, 'modelValue'), pollQuestionInputRef);
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center modal-overlay-bg"
    @click.self="close"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poll-modal-title"
      class="real-glass-modal relative w-full max-w-md rounded-xl p-6 text-foreground bg-transparent"
    >
      <h2 id="poll-modal-title" class="text-xl font-bold">Create Poll</h2>
      <p class="mt-1 text-sm text-muted">
        Ask a question and add options for others to vote on.
      </p>

      <div class="mt-5 space-y-4">
        <div>
          <label
            for="poll-question"
            class="block text-xs font-semibold uppercase text-muted mb-1.5"
          >
            Question
          </label>
          <input
            id="poll-question"
            ref="pollQuestionInputRef"
            v-model="question"
            type="text"
            placeholder="What do you want to ask?"
            class="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted outline-none transition-[box-shadow,border-color] focus-visible:border-border focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="text-xs font-semibold uppercase text-muted">
              Options
            </label>
            <button
              v-if="options.length < 10"
              type="button"
              class="text-xs font-medium text-accent hover:brightness-110 transition-[filter,color]"
              @click="addOption"
            >
              + Add option
            </button>
          </div>
          <div class="space-y-2">
            <div
              v-for="(opt, idx) in options"
              :key="opt.id"
              class="flex items-center gap-2"
            >
              <PollOptionEmojiPopover
                v-model="opt.emoji"
                class="flex-shrink-0"
                :server-id="props.serverId"
                :channel-id="props.channelId"
              />
              <input
                v-model="opt.text"
                type="text"
                :placeholder="`Option ${idx + 1}`"
                class="flex-1 min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none transition-[box-shadow,border-color] focus-visible:border-border focus-visible:ring-2 focus-visible:ring-accent/30"
              />
              <button
                v-if="options.length > 2"
                type="button"
                aria-label="Remove option"
                class="flex-shrink-0 p-1.5 rounded-md text-muted hover:text-red-400 hover:bg-glass-hover transition-colors"
                @click="removeOption(opt.id)"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
          <p class="mt-1.5 text-xs text-muted">
            {{ options.length }}/10 options • At least 2 required
          </p>
        </div>

        <label
          for="poll-anonymous"
          class="group flex cursor-pointer items-center gap-3 py-1"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors group-hover:text-foreground/70"
            aria-hidden="true"
          >
            <svg
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
              />
            </svg>
          </span>
          <div class="min-w-0 flex-1">
            <span class="text-sm font-medium text-foreground"
              >Anonymous voting</span
            >
            <span class="mt-0.5 block text-xs leading-snug text-muted">
              Voters’ names stay private; only vote counts are visible to
              others.
            </span>
          </div>
          <input
            id="poll-anonymous"
            v-model="anonymousPoll"
            type="checkbox"
            class="h-4 w-4 shrink-0 rounded border border-border bg-surface accent-indigo-600 outline-none transition-[box-shadow,border-color] focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        </label>

        <EchoDropdown
          v-model="durationMinutesModel"
          label="Time limit"
          :options="timeLimitDropdownOptions"
        />
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:text-foreground hover:bg-glass-hover transition-colors"
          @click="close"
        >
          Cancel
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          :disabled="!canSubmit()"
          @click="handleSubmit"
        >
          Create Poll
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
  box-shadow: 0px 4px 60px var(--vue-auto-013);
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background-color: var(--vue-auto-015);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
  }
}
</style>
