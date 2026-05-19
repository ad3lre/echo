<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type {
  EchoApplicationFormDto,
  EchoApplicationQuestionDto,
  EchoApplicationQuestionType,
  EchoServerApplicationRowDto,
} from '@/services/http/echoServerApplicationsTypes';
import {
  ECHO_CLIENT_UPLOAD_MAX_BYTES,
  httpApproveServerApplication,
  httpFetchServerApplicationSettings,
  httpFetchServerApplications,
  httpRejectServerApplication,
} from '@/services/http/echoServerApplicationsHttp';
import { createServerSettingsService } from '@/services/orchestration/serverSettings';
import { useServerStore } from '@/stores/server';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

const MAX_CHOICE_OPTIONS = 25;

const props = withDefaults(
  defineProps<{
    serverId: string;
    canManageServer: boolean;
    accessToken: string | null | undefined;
    workspaceServers: Ref<unknown[]>;
    /** Nested under Server Settings → Access: avoid duplicate scroll/root wrapper. */
    omitOuterRoot?: boolean;
  }>(),
  { omitOuterRoot: false },
);

const emit = defineEmits<{ 'echo-workspace-refresh': [] }>();

const loading = ref(true);
const saving = ref(false);
const listBusy = ref(false);
const applicationsEnabled = ref(false);
const applicationForm = ref<EchoApplicationFormDto>({
  version: 1,
  questions: [],
});
const pending = ref<EchoServerApplicationRowDto[]>([]);
const expandedId = ref<string | null>(null);

const serverSettingsService = createServerSettingsService();
const serverStore = useServerStore();

const uploadCapMb = Math.max(
  1,
  Math.floor(ECHO_CLIENT_UPLOAD_MAX_BYTES / (1024 * 1024)),
);

function questionTypeTitle(type: EchoApplicationQuestionType): string {
  switch (type) {
    case 'short':
      return 'Short answer';
    case 'long':
      return 'Long answer';
    case 'single':
      return 'Single choice';
    case 'multi':
      return 'Multiple choice';
    case 'attachment':
      return 'File upload';
    default:
      return type;
  }
}

function newQuestion(
  type: EchoApplicationQuestionType,
): EchoApplicationQuestionDto {
  const id = crypto.randomUUID();
  if (type === 'short')
    return { id, type: 'short', label: '', required: true, maxLength: 500 };
  if (type === 'long')
    return { id, type: 'long', label: '', required: true, maxLength: 4000 };
  if (type === 'single')
    return {
      id,
      type: 'single',
      label: '',
      required: true,
      options: ['Option A', 'Option B'],
    };
  if (type === 'multi')
    return {
      id,
      type: 'multi',
      label: '',
      required: true,
      options: ['Option A', 'Option B'],
    };
  if (type === 'attachment')
    return { id, type: 'attachment', label: '', required: true };
  const _never: never = type;
  return _never;
}

function addChoiceOption(q: EchoApplicationQuestionDto) {
  if (q.type !== 'single' && q.type !== 'multi') return;
  if (!q.options) q.options = [];
  if (q.options.length >= MAX_CHOICE_OPTIONS) {
    dispatchAppToast(
      `At most ${MAX_CHOICE_OPTIONS} options per question.`,
      'warning',
    );
    return;
  }
  q.options.push(`Option ${q.options.length + 1}`);
}

function removeChoiceOption(q: EchoApplicationQuestionDto, oi: number) {
  if (q.type !== 'single' && q.type !== 'multi') return;
  q.options?.splice(oi, 1);
}

function attachmentMaxMbField(q: EchoApplicationQuestionDto): string {
  if (q.type !== 'attachment' || !q.maxBytes) return '';
  return String(Math.round(q.maxBytes / (1024 * 1024)));
}

function onAttachmentMaxMbInput(q: EchoApplicationQuestionDto, raw: string) {
  if (q.type !== 'attachment') return;
  const t = raw.trim();
  if (!t) {
    delete q.maxBytes;
    return;
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n < 1) return;
  const mb = Math.min(Math.floor(n), uploadCapMb);
  q.maxBytes = mb * 1024 * 1024;
}

async function loadSettings() {
  if (!props.serverId) return;
  try {
    /* `echoFetch` uses cookie session; bearer token is legacy/mock only. */
    const s = await httpFetchServerApplicationSettings('', props.serverId);
    applicationsEnabled.value = s.applicationsEnabled;
    applicationForm.value = {
      version: s.applicationForm.version || 1,
      questions: (s.applicationForm.questions ?? []).map((q) => ({ ...q })),
    };
  } catch {
    dispatchAppToast('Could not load application settings.', 'error');
  }
}

async function loadPending() {
  if (!props.serverId) return;
  listBusy.value = true;
  try {
    const r = await httpFetchServerApplications('', props.serverId, 'pending');
    pending.value = r.applications ?? [];
  } catch {
    dispatchAppToast('Could not load waitlist.', 'error');
  } finally {
    listBusy.value = false;
  }
}

async function loadAll() {
  loading.value = true;
  await Promise.all([loadSettings(), loadPending()]);
  loading.value = false;
}

onMounted(() => void loadAll());

watch(
  () => props.serverId,
  () => void loadAll(),
);

function moveQuestion(i: number, dir: -1 | 1) {
  const j = i + dir;
  const qs = applicationForm.value.questions;
  if (j < 0 || j >= qs.length) return;
  const t = qs[i]!;
  qs[i] = qs[j]!;
  qs[j] = t;
}

function removeQuestion(i: number) {
  applicationForm.value.questions.splice(i, 1);
}

async function persistPatch(patch: Record<string, unknown>): Promise<boolean> {
  saving.value = true;
  try {
    await serverSettingsService.persistPreferences({
      token: props.accessToken?.trim() ?? '',
      serverId: props.serverId,
      patch,
      serverStore,
      workspaceServers: props.workspaceServers,
    });
    emit('echo-workspace-refresh');
    return true;
  } catch {
    dispatchAppToast('Could not save changes.', 'error');
    return false;
  } finally {
    saving.value = false;
  }
}

async function onToggleApplications(v: boolean) {
  const prev = applicationsEnabled.value;
  applicationsEnabled.value = v;
  const ok = await persistPatch({ applicationsEnabled: v });
  if (!ok) applicationsEnabled.value = prev;
}

function validateFormForSave(): string | null {
  for (const q of applicationForm.value.questions) {
    if (!q.label.trim()) return 'Each question needs a label.';
    if (q.type === 'single' || q.type === 'multi') {
      const opts = (q.options ?? []).map((s) => s.trim()).filter(Boolean);
      if (opts.length < 1)
        return 'Choice questions need at least one non-empty option.';
      if (opts.length > MAX_CHOICE_OPTIONS)
        return 'Too many options on one question.';
      const seen = new Set<string>();
      for (const o of opts) {
        const k = o.toLowerCase();
        if (seen.has(k))
          return 'Choice options must be unique (case-insensitive).';
        seen.add(k);
      }
    }
  }
  return null;
}

async function saveForm() {
  const err = validateFormForSave();
  if (err) {
    dispatchAppToast(err, 'warning');
    return;
  }
  const ok = await persistPatch({
    applicationForm: {
      version: 1,
      questions: applicationForm.value.questions.map((q) => ({ ...q })),
    },
  });
  if (!ok) return;
  await loadSettings();
  dispatchAppToast('Application form saved.', 'success');
}

async function approve(id: string) {
  listBusy.value = true;
  try {
    await httpApproveServerApplication('', props.serverId, id);
    await loadPending();
    emit('echo-workspace-refresh');
    dispatchAppToast('Member approved.', 'success');
  } catch {
    dispatchAppToast('Could not approve.', 'error');
  } finally {
    listBusy.value = false;
  }
}

async function reject(id: string) {
  listBusy.value = true;
  try {
    await httpRejectServerApplication('', props.serverId, id);
    await loadPending();
    dispatchAppToast('Application rejected.', 'success');
  } catch {
    dispatchAppToast('Could not reject.', 'error');
  } finally {
    listBusy.value = false;
  }
}

function questionLabelById(id: string): string {
  const qq = applicationForm.value.questions.find((x) => x.id === id);
  return qq?.label?.trim() || id;
}

type WaitlistAnswerRow =
  | { label: string; kind: 'text'; text: string }
  | { label: string; kind: 'list'; items: string[] }
  | { label: string; kind: 'file'; fileName: string; fileUrl: string };

function waitlistAnswerRows(
  answers: Record<string, unknown>,
): WaitlistAnswerRow[] {
  const rows: WaitlistAnswerRow[] = [];
  for (const [k, v] of Object.entries(answers)) {
    const label = questionLabelById(k);
    if (typeof v === 'string') {
      rows.push({ label, kind: 'text', text: v });
    } else if (Array.isArray(v)) {
      rows.push({ label, kind: 'list', items: v.map(String) });
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if (typeof o.publicUrl === 'string' && typeof o.name === 'string') {
        rows.push({
          label,
          kind: 'file',
          fileName: o.name,
          fileUrl: o.publicUrl,
        });
      } else {
        rows.push({
          label,
          kind: 'text',
          text: JSON.stringify(v),
        });
      }
    } else {
      rows.push({ label, kind: 'text', text: String(v) });
    }
  }
  return rows;
}
</script>

<template>
  <div
    :class="
      props.omitOuterRoot
        ? 'space-y-5'
        : 'server-settings-panel-root space-y-5 pb-8'
    "
  >
    <div v-if="!canManageServer" class="server-settings-panel rounded-2xl p-5">
      <p class="text-sm text-muted">
        You don’t have permission to manage applications for this server.
      </p>
    </div>

    <template v-else>
      <div class="server-settings-panel rounded-2xl p-5">
        <div class="settings-subtitle mb-1">Join applications</div>
        <p class="mb-4 text-sm text-fg-subtle">
          When enabled, new members must complete your form and wait for
          approval before they can join (Explore joins and normal invite links).
          Create a
          <strong class="font-semibold text-fg">direct invite</strong> from the
          invite panel to share a link that skips this step.
        </p>
        <div v-if="loading" class="text-sm text-muted">Loading…</div>
        <div v-else class="server-toggle-row">
          <div>
            <div class="text-sm font-semibold text-fg">Enable applications</div>
            <div class="mt-0.5 text-xs text-fg-subtle">
              Gate joins behind your questionnaire and waitlist.
            </div>
          </div>
          <label class="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              class="peer sr-only"
              :checked="applicationsEnabled"
              :disabled="saving"
              @change="
                onToggleApplications(
                  ($event.target as HTMLInputElement).checked,
                )
              "
            />
            <span
              class="h-6 w-11 rounded-full bg-[var(--set-toggle-bg)] transition peer-checked:bg-[var(--accent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]"
            />
            <span
              class="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5"
            />
          </label>
        </div>
      </div>

      <div class="server-settings-panel rounded-2xl p-5">
        <div class="settings-subtitle mb-3">Form builder</div>
        <p class="mb-4 text-sm text-fg-subtle">
          Build your questionnaire: joiners see questions in order. Choice
          questions use explicit options; file uploads use your storage plan
          limits unless you set a lower cap.
        </p>
        <div
          class="mb-5 flex flex-wrap gap-2 rounded-xl border border-[var(--border)] bg-[var(--set-card-bg)] p-3"
        >
          <button
            type="button"
            class="rounded-lg border border-[var(--border)] bg-[var(--set-action-bg)] px-3 py-2 text-xs font-semibold text-fg shadow-sm hover:bg-[var(--set-action-hover-bg)]"
            :disabled="saving || !applicationsEnabled"
            @click="applicationForm.questions.push(newQuestion('short'))"
          >
            + Short answer
          </button>
          <button
            type="button"
            class="rounded-lg border border-[var(--border)] bg-[var(--set-action-bg)] px-3 py-2 text-xs font-semibold text-fg shadow-sm hover:bg-[var(--set-action-hover-bg)]"
            :disabled="saving || !applicationsEnabled"
            @click="applicationForm.questions.push(newQuestion('long'))"
          >
            + Long answer
          </button>
          <button
            type="button"
            class="rounded-lg border border-[var(--border)] bg-[var(--set-action-bg)] px-3 py-2 text-xs font-semibold text-fg shadow-sm hover:bg-[var(--set-action-hover-bg)]"
            :disabled="saving || !applicationsEnabled"
            @click="applicationForm.questions.push(newQuestion('single'))"
          >
            + Single choice
          </button>
          <button
            type="button"
            class="rounded-lg border border-[var(--border)] bg-[var(--set-action-bg)] px-3 py-2 text-xs font-semibold text-fg shadow-sm hover:bg-[var(--set-action-hover-bg)]"
            :disabled="saving || !applicationsEnabled"
            @click="applicationForm.questions.push(newQuestion('multi'))"
          >
            + Multiple choice
          </button>
          <button
            type="button"
            class="rounded-lg border border-[var(--border)] bg-[var(--set-action-bg)] px-3 py-2 text-xs font-semibold text-fg shadow-sm hover:bg-[var(--set-action-hover-bg)]"
            :disabled="saving || !applicationsEnabled"
            @click="applicationForm.questions.push(newQuestion('attachment'))"
          >
            + File upload
          </button>
        </div>

        <div
          v-if="!applicationForm.questions.length"
          class="rounded-xl border border-dashed border-[var(--border)] bg-[var(--set-card-bg)] p-8 text-center text-sm text-muted"
        >
          No questions yet. Add at least one to collect meaningful responses.
        </div>

        <div class="space-y-4">
          <div
            v-for="(q, i) in applicationForm.questions"
            :key="q.id"
            class="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--set-card-bg)] shadow-sm"
          >
            <div
              class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3"
            >
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <span
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-xs font-bold text-[var(--accent-contrast-fg)]"
                >
                  {{ i + 1 }}
                </span>
                <span
                  class="truncate text-sm font-semibold text-fg"
                  :title="questionTypeTitle(q.type)"
                >
                  {{ questionTypeTitle(q.type) }}
                </span>
              </div>
              <div class="flex shrink-0 flex-wrap gap-1">
                <button
                  type="button"
                  class="rounded-lg border border-transparent px-2.5 py-1 text-xs font-medium text-muted hover:border-[var(--border)] hover:bg-[var(--set-action-hover-bg)] hover:text-fg disabled:opacity-40"
                  :disabled="i === 0"
                  @click="moveQuestion(i, -1)"
                >
                  Move up
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-transparent px-2.5 py-1 text-xs font-medium text-muted hover:border-[var(--border)] hover:bg-[var(--set-action-hover-bg)] hover:text-fg disabled:opacity-40"
                  :disabled="i === applicationForm.questions.length - 1"
                  @click="moveQuestion(i, 1)"
                >
                  Move down
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-transparent px-2.5 py-1 text-xs font-medium text-rose-400 hover:bg-rose-500/10"
                  @click="removeQuestion(i)"
                >
                  Remove
                </button>
              </div>
            </div>

            <div class="space-y-3 p-4">
              <div>
                <label class="settings-label">Question label</label>
                <input
                  v-model="q.label"
                  type="text"
                  class="server-input mt-1 w-full"
                  maxlength="200"
                  placeholder="What should we call you?"
                />
              </div>

              <label
                class="inline-flex cursor-pointer items-center gap-2 text-sm text-fg"
              >
                <input
                  v-model="q.required"
                  type="checkbox"
                  class="rounded border-[var(--border)]"
                />
                Required
              </label>

              <template v-if="q.type === 'short' || q.type === 'long'">
                <label class="settings-label block"
                  >Placeholder (optional)</label
                >
                <input
                  v-model="q.placeholder"
                  type="text"
                  class="server-input mt-1 w-full"
                  maxlength="120"
                  placeholder="Shown inside the empty field…"
                />
                <label class="settings-label mt-3 block">Character limit</label>
                <input
                  v-model.number="q.maxLength"
                  type="number"
                  min="1"
                  :max="q.type === 'short' ? 500 : 4000"
                  class="server-input mt-1 w-40"
                />
              </template>

              <template v-if="q.type === 'single' || q.type === 'multi'">
                <div class="flex items-center justify-between gap-2">
                  <label class="settings-label m-0">Answer options</label>
                  <button
                    type="button"
                    class="rounded-lg border border-[var(--border)] bg-[var(--set-action-bg)] px-2.5 py-1 text-xs font-semibold text-fg hover:bg-[var(--set-action-hover-bg)]"
                    :disabled="
                      saving ||
                      !applicationsEnabled ||
                      (q.options?.length ?? 0) >= MAX_CHOICE_OPTIONS
                    "
                    @click="addChoiceOption(q)"
                  >
                    Add option
                  </button>
                </div>
                <p class="mt-1 text-xs text-fg-subtle">
                  Up to {{ MAX_CHOICE_OPTIONS }} options; labels must be unique
                  (ignoring case).
                </p>
                <ul class="mt-2 space-y-2">
                  <li
                    v-for="(opt, oi) in q.options ?? []"
                    :key="oi"
                    class="flex gap-2"
                  >
                    <input
                      :value="opt"
                      type="text"
                      maxlength="200"
                      class="server-input min-w-0 flex-1"
                      :placeholder="'Option ' + (oi + 1)"
                      @input="
                        (e) => {
                          if (!q.options) q.options = [];
                          q.options[oi] = (e.target as HTMLInputElement).value;
                        }
                      "
                    />
                    <button
                      type="button"
                      class="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium text-muted hover:bg-[var(--set-action-hover-bg)] hover:text-fg disabled:opacity-40"
                      :disabled="(q.options?.length ?? 0) <= 1"
                      @click="removeChoiceOption(q, oi)"
                    >
                      Remove
                    </button>
                  </li>
                </ul>
              </template>

              <template v-if="q.type === 'attachment'">
                <label class="settings-label block"
                  >Max file size (optional)</label
                >
                <p class="mt-0.5 text-xs text-fg-subtle">
                  Leave blank to use the uploader’s plan limit (at most
                  {{ uploadCapMb }}
                  MiB). Lower values help keep applications lightweight.
                </p>
                <input
                  :value="attachmentMaxMbField(q)"
                  type="number"
                  min="1"
                  :max="uploadCapMb"
                  class="server-input mt-1 w-40"
                  placeholder="MiB"
                  @change="
                    onAttachmentMaxMbInput(
                      q,
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </template>
            </div>
          </div>
        </div>

        <div class="mt-5 flex justify-end">
          <button
            type="button"
            class="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast-fg)] disabled:opacity-50"
            :disabled="saving || !applicationsEnabled"
            @click="saveForm"
          >
            Save form
          </button>
        </div>
      </div>

      <div class="server-settings-panel rounded-2xl p-5">
        <div class="settings-subtitle mb-3">Waitlist</div>
        <p class="mb-4 text-sm text-fg-subtle">
          Pending applications. Approve to add the member; reject to dismiss.
        </p>
        <div v-if="listBusy && !pending.length" class="text-sm text-muted">
          Loading…
        </div>
        <div v-else-if="!pending.length" class="text-sm text-muted">
          No pending applications.
        </div>
        <ul v-else class="space-y-3">
          <li
            v-for="row in pending"
            :key="row.id"
            class="rounded-xl border border-[var(--border)] bg-[var(--set-card-bg)] p-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div class="text-sm font-semibold text-fg">
                  User {{ row.userId }}
                </div>
                <div class="text-xs text-fg-subtle">
                  {{ row.source }} · {{ row.createdAt }}
                </div>
              </div>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-fg hover:bg-[var(--set-action-hover-bg)]"
                  @click="expandedId = expandedId === row.id ? null : row.id"
                >
                  {{ expandedId === row.id ? 'Hide' : 'View' }} answers
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-contrast-fg)] disabled:opacity-50"
                  :disabled="listBusy"
                  @click="approve(row.id)"
                >
                  Approve
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-400 disabled:opacity-50"
                  :disabled="listBusy"
                  @click="reject(row.id)"
                >
                  Reject
                </button>
              </div>
            </div>
            <div
              v-if="expandedId === row.id"
              class="custom-scrollbar mt-3 max-h-64 space-y-3 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3"
            >
              <div
                v-for="(ar, ai) in waitlistAnswerRows(row.answers)"
                :key="row.id + '-' + String(ai)"
                class="text-sm"
              >
                <div class="font-semibold text-fg">{{ ar.label }}</div>
                <div
                  v-if="ar.kind === 'text'"
                  class="mt-1 whitespace-pre-wrap text-fg-subtle"
                >
                  {{ ar.text }}
                </div>
                <ul
                  v-else-if="ar.kind === 'list'"
                  class="mt-1 list-inside list-disc text-fg-subtle"
                >
                  <li v-for="(it, ii) in ar.items" :key="ii">{{ it }}</li>
                </ul>
                <div v-else class="mt-1">
                  <a
                    :href="ar.fileUrl"
                    class="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {{ ar.fileName }}
                  </a>
                  <span class="text-xs text-fg-subtle"> — open file</span>
                </div>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>
