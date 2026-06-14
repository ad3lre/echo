<script setup lang="ts">
import { computed, reactive, ref, toRef, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useAuthSessionStore } from '@/stores/authSession';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import type { ServerApplicationModalPayload } from '@/features/layout/composables/useServerApplicationModal';
import type {
  EchoApplicationAttachmentAnswerDto,
  EchoApplicationQuestionDto,
} from '@/services/http/echoServerApplicationsTypes';
import {
  httpSubmitServerApplication,
  httpUploadServerApplicationAttachment,
} from '@/services/http/echoServerApplicationsHttp';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    payload: ServerApplicationModalPayload | null;
    busy?: boolean;
  }>(),
  { busy: false },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submitted: [];
}>();

const authSession = useAuthSessionStore();
const { backendUser } = storeToRefs(authSession);

/** Cookie sessions have no bearer token; guests cannot submit applications server-side. */
const canSubmitEchoApplications = computed(() => {
  const u = backendUser.value;
  return !!u && !u.isGuest;
});

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const answers = reactive<Record<string, unknown>>({});
const localBusy = ref(false);
const attachmentUploadingId = ref<string | null>(null);
const attachmentProgress = ref<number | null>(null);

watch(
  () => props.payload,
  (p) => {
    for (const k of Object.keys(answers)) delete answers[k];
    if (!p) return;
    for (const q of p.applicationForm.questions) {
      if (q.type === 'multi') answers[q.id] = [];
      else if (q.type === 'attachment') answers[q.id] = null;
      else answers[q.id] = '';
    }
  },
  { immediate: true },
);

const displayName = computed(
  () => props.payload?.serverName?.trim() || 'Server',
);

const iconSrc = computed(() =>
  safeImageUrl(serverGuildIconDisplayUrl(props.payload?.iconUrl)),
);

const submitLocked = computed(
  () => localBusy.value || props.busy || attachmentUploadingId.value != null,
);

function close() {
  if (localBusy.value || props.busy || attachmentUploadingId.value != null)
    return;
  emit('update:modelValue', false);
}

function toggleMulti(
  q: EchoApplicationQuestionDto,
  opt: string,
  checked: boolean,
) {
  const cur = (answers[q.id] as string[]) ?? [];
  if (checked) {
    if (!cur.includes(opt)) cur.push(opt);
  } else {
    const i = cur.indexOf(opt);
    if (i >= 0) cur.splice(i, 1);
  }
  answers[q.id] = cur;
}

function isMultiChecked(q: EchoApplicationQuestionDto, opt: string): boolean {
  return ((answers[q.id] as string[]) ?? []).includes(opt);
}

function attachmentAnswer(
  q: EchoApplicationQuestionDto,
): EchoApplicationAttachmentAnswerDto | null {
  const v = answers[q.id];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as EchoApplicationAttachmentAnswerDto;
  return o.publicUrl && o.key ? o : null;
}

function clearAttachment(qId: string) {
  answers[qId] = null;
}

async function onAttachmentFile(q: EchoApplicationQuestionDto, ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const p = props.payload;
  if (!p || !canSubmitEchoApplications.value) {
    dispatchAppToast(
      'Sign in with a full account to upload a file.',
      'warning',
    );
    return;
  }
  attachmentUploadingId.value = q.id;
  attachmentProgress.value = null;
  try {
    const r = await httpUploadServerApplicationAttachment(
      '',
      p.serverId,
      file,
      {
        questionMaxBytes: q.maxBytes,
        onProgress: (pct) => {
          attachmentProgress.value = pct;
        },
      },
    );
    answers[q.id] = r;
  } catch {
    dispatchAppToast('Could not upload file.', 'error');
  } finally {
    attachmentUploadingId.value = null;
    attachmentProgress.value = null;
  }
}

function buildSubmitAnswers(): Record<string, unknown> {
  const p = props.payload;
  if (!p) return {};
  const out: Record<string, unknown> = {};
  for (const q of p.applicationForm.questions) {
    const v = answers[q.id];
    if (q.type === 'attachment') {
      if (attachmentAnswer(q)) out[q.id] = v;
      continue;
    }
    if (v === undefined || v === null || v === '') continue;
    if (q.type === 'multi' && Array.isArray(v) && v.length === 0) continue;
    out[q.id] = v;
  }
  return out;
}

async function submit() {
  const p = props.payload;
  if (!p || localBusy.value || attachmentUploadingId.value != null) return;
  if (!canSubmitEchoApplications.value) {
    dispatchAppToast(
      'Sign in with a full account to submit an application.',
      'warning',
    );
    return;
  }
  localBusy.value = true;
  try {
    await httpSubmitServerApplication('', p.serverId, {
      source: p.source,
      inviteToken: p.inviteToken,
      answers: buildSubmitAnswers(),
    });
    dispatchAppToast('Application sent — you’re on the waitlist.', 'success');
    emit('submitted');
  } catch {
    dispatchAppToast('Could not submit application.', 'error');
  } finally {
    localBusy.value = false;
  }
}
</script>

<template>
  <div
    v-if="modelValue && payload"
    class="fixed inset-0 z-[175] flex items-center justify-center modal-overlay-bg px-4 py-6"
    @click.self="close"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="server-app-title"
      class="server-application-modal real-glass-modal relative flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-transparent p-0 text-foreground"
    >
      <div
        class="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-xl bg-gradient-to-b from-indigo-500/20 to-transparent opacity-90"
      />

      <div class="relative shrink-0 border-b border-[var(--border)] p-5 pb-4">
        <h2 id="server-app-title" class="text-lg font-bold text-fg">
          Apply to join
        </h2>
        <p class="mt-1 text-sm text-fg-subtle">
          This server requires a short application before you can become a
          member.
        </p>
        <div
          class="mt-4 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--set-card-bg)] px-3 py-2.5"
        >
          <img
            :src="iconSrc"
            :alt="`${displayName} icon`"
            class="h-10 w-10 shrink-0 rounded-lg object-contain"
          />
          <div class="min-w-0 truncate text-sm font-semibold text-fg">
            {{ displayName }}
          </div>
        </div>
      </div>

      <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5 pt-4">
        <div class="space-y-4">
          <div
            v-for="q in payload.applicationForm.questions"
            :key="q.id"
            class="rounded-xl border border-[var(--border)] bg-[var(--set-card-bg)] p-4"
          >
            <label class="settings-label">
              {{ q.label || 'Question' }}
              <span v-if="q.required" class="text-rose-400">*</span>
            </label>
            <input
              v-if="q.type === 'short'"
              v-model="answers[q.id] as string"
              type="text"
              class="server-input mt-2 w-full"
              :maxlength="q.maxLength ?? 500"
              :placeholder="q.placeholder"
            />
            <textarea
              v-else-if="q.type === 'long'"
              v-model="answers[q.id] as string"
              class="server-input mt-2 min-h-[120px] w-full resize-y"
              :maxlength="q.maxLength ?? 4000"
              :placeholder="q.placeholder"
            />
            <div v-else-if="q.type === 'single'" class="mt-2 space-y-2">
              <label
                v-for="opt in q.options ?? []"
                :key="opt"
                class="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-fg hover:bg-[var(--set-action-hover-bg)]"
              >
                <input
                  v-model="answers[q.id] as string"
                  type="radio"
                  :name="'q-' + q.id"
                  :value="opt"
                />
                <span>{{ opt }}</span>
              </label>
            </div>
            <div v-else-if="q.type === 'multi'" class="mt-2 space-y-2">
              <label
                v-for="opt in q.options ?? []"
                :key="opt"
                class="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-fg hover:bg-[var(--set-action-hover-bg)]"
              >
                <input
                  type="checkbox"
                  :checked="isMultiChecked(q, opt)"
                  @change="
                    toggleMulti(
                      q,
                      opt,
                      ($event.target as HTMLInputElement).checked,
                    )
                  "
                />
                <span>{{ opt }}</span>
              </label>
            </div>
            <div v-else-if="q.type === 'attachment'" class="mt-2 space-y-2">
              <input
                :id="'server-app-att-' + q.id"
                type="file"
                class="sr-only"
                :disabled="attachmentUploadingId != null"
                @change="onAttachmentFile(q, $event)"
              />
              <div
                v-if="attachmentAnswer(q)"
                class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-fg"
              >
                <span class="min-w-0 flex-1 truncate font-medium">{{
                  attachmentAnswer(q)!.name
                }}</span>
                <button
                  type="button"
                  class="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-muted hover:bg-[var(--set-action-hover-bg)] hover:text-fg"
                  :disabled="attachmentUploadingId != null"
                  @click="clearAttachment(q.id)"
                >
                  Remove
                </button>
              </div>
              <div v-else class="flex flex-col gap-2">
                <label
                  :for="'server-app-att-' + q.id"
                  class="inline-flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg)] px-4 py-6 text-center text-sm font-semibold text-fg hover:border-[var(--accent)] hover:bg-[var(--set-action-hover-bg)]"
                  :class="
                    attachmentUploadingId != null
                      ? 'pointer-events-none opacity-50'
                      : ''
                  "
                >
                  Choose file
                </label>
              </div>
              <p
                v-if="attachmentUploadingId === q.id"
                class="text-xs text-fg-subtle"
              >
                Uploading<span v-if="attachmentProgress != null">
                  {{ ' ' }}{{ attachmentProgress }}%</span
                >…
              </p>
              <p v-if="q.maxBytes" class="text-xs text-fg-subtle">
                Max file size: {{ Math.round(q.maxBytes / (1024 * 1024)) }} MiB
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        class="relative flex shrink-0 justify-end gap-2 border-t border-[var(--border)] bg-[var(--echo-modal-bg-muted)] p-4"
      >
        <button
          type="button"
          class="rounded-lg px-4 py-2 text-sm font-semibold text-muted hover:bg-[var(--set-action-hover-bg)] hover:text-fg"
          :disabled="submitLocked"
          @click="close"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast-fg)] disabled:opacity-50"
          :disabled="submitLocked"
          @click="submit"
        >
          Submit application
        </button>
      </div>
    </div>
  </div>
</template>
