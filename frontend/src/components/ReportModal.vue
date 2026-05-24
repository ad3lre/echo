<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import {
  ECHO_REPORT_CATEGORIES,
  type EchoReportCategory,
} from '@shared/safetyReports';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useAutofocusOnOpen } from '@/composables/useAutofocusOnOpen';
import { useAuthSessionStore } from '@/stores/authSession';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import {
  closeReportModal,
  REPORT_CATEGORY_LABELS,
  useReportModalState,
} from '@/features/safety/reportModal';
import { submitSafetyReport } from '@/features/safety/submitSafetyReport';

const { isOpen, context } = useReportModalState();
const authSession = useAuthSessionStore();

const modalRef = ref<HTMLElement | null>(null);
const reasonInputRef = ref<HTMLTextAreaElement | null>(null);
const category = ref<EchoReportCategory>('other');
const reason = ref('');
const submitting = ref(false);
const errorMessage = ref<string | null>(null);

const generalTargetType = ref<'user' | 'message'>('user');
const generalTargetUserId = ref('');
const generalMessageId = ref('');
const generalChannelId = ref('');

useFocusTrap(modalRef, isOpen);
useAutofocusOnOpen(isOpen, reasonInputRef);

const title = computed(() => {
  const ctx = context.value;
  if (!ctx) return 'Report';
  if (ctx.kind === 'user') return 'Report user';
  if (ctx.kind === 'message') return 'Report message';
  return 'Report abuse';
});

const subtitle = computed(() => {
  const ctx = context.value;
  if (!ctx) return '';
  if (ctx.kind === 'user') {
    const name = ctx.displayName?.trim();
    return name
      ? `Reporting ${name}. Trust and safety reviews these reports.`
      : 'Trust and safety reviews these reports.';
  }
  if (ctx.kind === 'message') {
    const name = ctx.authorDisplayName?.trim() || 'a user';
    return `Reporting a message from ${name}. Trust and safety reviews these reports.`;
  }
  return 'Report a user or message by ID if you cannot use the in-app menu on a profile or message.';
});

const messagePreview = computed(() => {
  const ctx = context.value;
  if (ctx?.kind !== 'message') return '';
  const raw = ctx.preview?.trim() ?? '';
  if (!raw) return '';
  return raw.length > 280 ? `${raw.slice(0, 280)}…` : raw;
});

const categoryOptions = ECHO_REPORT_CATEGORIES.map((id) => ({
  id,
  label: REPORT_CATEGORY_LABELS[id],
}));

function resetForm() {
  category.value = 'other';
  reason.value = '';
  errorMessage.value = null;
  generalTargetType.value = 'user';
  generalTargetUserId.value = '';
  generalMessageId.value = '';
  generalChannelId.value = '';
}

watch(isOpen, (open) => {
  if (open) resetForm();
});

function handleClose() {
  closeReportModal();
}

async function handleSubmit() {
  const ctx = context.value;
  if (!ctx || submitting.value) return;
  const token = authSession.accessToken?.trim() ?? '';
  if (!authSession.isAuthenticated || !token) {
    errorMessage.value = 'Sign in to submit a report.';
    return;
  }
  submitting.value = true;
  errorMessage.value = null;
  try {
    await submitSafetyReport({
      token,
      context: ctx,
      category: category.value,
      reason: reason.value,
      ...(ctx.kind === 'general'
        ? {
            general: {
              targetType: generalTargetType.value,
              targetUserId: generalTargetUserId.value,
              messageId: generalMessageId.value,
              channelId: generalChannelId.value,
            },
          }
        : {}),
    });
    closeReportModal();
    dispatchAppToast('Report submitted. Thank you.', 'success');
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
      v-if="isOpen && context"
      class="report-modal-overlay fixed inset-0 z-[170] flex items-center justify-center px-4 py-6"
      @click.self="handleClose"
    >
      <div
        ref="modalRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        class="report-modal-panel relative mx-auto w-full max-w-lg rounded-xl border border-[var(--border)] p-6 text-[var(--text)] shadow-[var(--shadow-3)] bg-[var(--echo-modal-bg,var(--surface))]"
      >
        <h2 id="report-modal-title" class="text-lg font-bold leading-tight">
          {{ title }}
        </h2>
        <p class="mt-2 text-sm text-[var(--muted)]">
          {{ subtitle }}
        </p>

        <div
          v-if="context.kind === 'message' && messagePreview"
          class="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]"
        >
          {{ messagePreview }}
        </div>

        <template v-if="context.kind === 'general'">
          <div class="mt-4 flex gap-2">
            <button
              type="button"
              class="flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors"
              :class="
                generalTargetType === 'user'
                  ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]'
                  : 'border-[var(--border)] text-[var(--muted)] hover:bg-glass-hover'
              "
              @click="generalTargetType = 'user'"
            >
              User
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors"
              :class="
                generalTargetType === 'message'
                  ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]'
                  : 'border-[var(--border)] text-[var(--muted)] hover:bg-glass-hover'
              "
              @click="generalTargetType = 'message'"
            >
              Message
            </button>
          </div>
          <label
            v-if="generalTargetType === 'user'"
            class="mt-3 block text-sm font-medium text-[var(--text)]"
          >
            User ID
            <input
              v-model="generalTargetUserId"
              type="text"
              class="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              placeholder="User snowflake ID"
              autocomplete="off"
            />
          </label>
          <template v-else>
            <label class="mt-3 block text-sm font-medium text-[var(--text)]">
              Message ID
              <input
                v-model="generalMessageId"
                type="text"
                class="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                placeholder="Message snowflake ID"
                autocomplete="off"
              />
            </label>
            <label class="mt-3 block text-sm font-medium text-[var(--text)]">
              Channel ID
              <input
                v-model="generalChannelId"
                type="text"
                class="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                placeholder="Channel snowflake ID"
                autocomplete="off"
              />
            </label>
          </template>
        </template>

        <label class="mt-4 block text-sm font-medium text-[var(--text)]">
          Category
          <select
            v-model="category"
            class="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
          >
            <option
              v-for="opt in categoryOptions"
              :key="opt.id"
              :value="opt.id"
            >
              {{ opt.label }}
            </option>
          </select>
        </label>

        <label class="mt-3 block text-sm font-medium text-[var(--text)]">
          Details
          <textarea
            ref="reasonInputRef"
            v-model="reason"
            class="mt-1 w-full min-h-[100px] resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
            maxlength="2000"
            placeholder="What happened? (optional)"
          />
        </label>

        <p v-if="errorMessage" class="mt-3 text-sm text-red-400" role="alert">
          {{ errorMessage }}
        </p>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-glass-hover"
            :disabled="submitting"
            @click="handleClose"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg bg-rose-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
            :disabled="submitting"
            @click="handleSubmit"
          >
            {{ submitting ? 'Submitting…' : 'Submit report' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
