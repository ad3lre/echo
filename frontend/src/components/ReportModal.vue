<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ECHO_REPORT_CATEGORIES,
  type EchoReportCategory,
} from '@shared/safetyReports';
import { icons } from '@/assets/icons';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useAutofocusOnOpen } from '@/composables/useAutofocusOnOpen';
import { useEchoWorkspace } from '@/composables/useEchoWorkspace';
import { useAuthSessionStore } from '@/stores/authSession';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { isTrustedMediaUrl } from '@/utils/safeImageUrl';
import {
  closeReportModal,
  REPORT_CATEGORY_HINTS,
  REPORT_CATEGORY_LABELS,
  useReportModalState,
} from '@/features/safety/reportModal';
import { submitSafetyReport } from '@/features/safety/submitSafetyReport';
import {
  buildReportChannelCandidates,
  buildReportMessageCandidates,
  buildReportUserCandidates,
} from '@/features/safety/useReportModalPickers';

const { isOpen, context } = useReportModalState();
const authSession = useAuthSessionStore();
const workspace = useEchoWorkspace();

const modalRef = ref<HTMLElement | null>(null);
const reasonInputRef = ref<HTMLTextAreaElement | null>(null);
const targetSearchRef = ref<HTMLInputElement | null>(null);

const category = ref<EchoReportCategory>('other');
const reason = ref('');
const submitting = ref(false);
const errorMessage = ref<string | null>(null);

const generalTargetType = ref<'user' | 'message'>('user');
const targetSearchQuery = ref('');
const pickedUserId = ref('');
const pickedChannelId = ref('');
const pickedMessageId = ref('');
const showManualIds = ref(false);
const generalTargetUserId = ref('');
const generalMessageId = ref('');
const generalChannelId = ref('');

useFocusTrap(modalRef, isOpen);

const isGeneral = computed(() => context.value?.kind === 'general');
const hasTargetContext = computed(
  () => context.value?.kind === 'user' || context.value?.kind === 'message',
);

useAutofocusOnOpen(isOpen, reasonInputRef, {
  when: hasTargetContext,
});
useAutofocusOnOpen(isOpen, targetSearchRef, {
  when: isGeneral,
});

const title = computed(() => {
  const ctx = context.value;
  if (!ctx) return 'Report';
  if (ctx.kind === 'user') return 'Report user';
  if (ctx.kind === 'message') return 'Report message';
  return 'Report to Trust & Safety';
});

const subtitle = computed(() => {
  const ctx = context.value;
  if (!ctx) return '';
  if (ctx.kind === 'user') {
    const name = ctx.displayName?.trim();
    return name
      ? `You are reporting ${name}. Our team reviews every submission.`
      : 'Our team reviews every submission.';
  }
  if (ctx.kind === 'message') {
    const name = ctx.authorDisplayName?.trim() || 'someone';
    return `You are reporting a message from ${name}.`;
  }
  return 'Search for who or what to report. You can also enter IDs manually if needed.';
});

const targetCard = computed(() => {
  const ctx = context.value;
  if (!ctx) return null;
  if (ctx.kind === 'user') {
    return {
      kind: 'user' as const,
      label: ctx.displayName?.trim() || 'User',
    };
  }
  if (ctx.kind === 'message') {
    return {
      kind: 'message' as const,
      label: ctx.authorDisplayName?.trim() || 'Message',
      preview: messagePreview.value,
    };
  }
  return null;
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
  hint: REPORT_CATEGORY_HINTS[id],
}));

const userCandidates = computed(() =>
  buildReportUserCandidates({
    users: workspace.users.value,
    friendIds: workspace.friendIds.value,
    serverMemberIds: workspace.serverMemberIds.value,
    query: generalTargetType.value === 'user' ? targetSearchQuery.value : '',
  }),
);

const channelCandidates = computed(() =>
  buildReportChannelCandidates({
    servers: workspace.servers.value,
    categoriesByServer: workspace.categoriesByServer.value,
    query: generalTargetType.value === 'message' ? targetSearchQuery.value : '',
  }),
);

const messageCandidates = computed(() =>
  buildReportMessageCandidates({
    channelId: pickedChannelId.value,
    messages: workspace.messages.value,
    users: workspace.users.value,
    query: targetSearchQuery.value,
  }),
);

const pickedUser = computed(() =>
  userCandidates.value.find((u) => u.id === pickedUserId.value),
);

const pickedChannel = computed(() =>
  channelCandidates.value.find((c) => c.channelId === pickedChannelId.value),
);

const pickedMessage = computed(() =>
  messageCandidates.value.find((m) => m.messageId === pickedMessageId.value),
);

const canSubmit = computed(() => {
  const ctx = context.value;
  if (!ctx || submitting.value) return false;
  if (ctx.kind === 'user' || ctx.kind === 'message') return true;
  if (generalTargetType.value === 'user') {
    if (pickedUserId.value.trim()) return true;
    return showManualIds.value && generalTargetUserId.value.trim().length > 0;
  }
  if (pickedMessageId.value.trim() && pickedChannelId.value.trim()) return true;
  return (
    showManualIds.value &&
    generalMessageId.value.trim().length > 0 &&
    generalChannelId.value.trim().length > 0
  );
});

function resetForm() {
  category.value = 'other';
  reason.value = '';
  errorMessage.value = null;
  generalTargetType.value = 'user';
  targetSearchQuery.value = '';
  pickedUserId.value = '';
  pickedChannelId.value = '';
  pickedMessageId.value = '';
  showManualIds.value = false;
  generalTargetUserId.value = '';
  generalMessageId.value = '';
  generalChannelId.value = '';
}

watch(isOpen, (open) => {
  if (open) resetForm();
});

watch(generalTargetType, () => {
  targetSearchQuery.value = '';
  pickedUserId.value = '';
  pickedChannelId.value = '';
  pickedMessageId.value = '';
  errorMessage.value = null;
});

watch(pickedChannelId, () => {
  pickedMessageId.value = '';
});

function handleClose() {
  closeReportModal();
}

function selectUser(id: string) {
  pickedUserId.value = id;
  showManualIds.value = false;
}

function selectChannel(channelId: string) {
  pickedChannelId.value = channelId;
  pickedMessageId.value = '';
  targetSearchQuery.value = '';
}

function selectMessage(messageId: string, channelId: string) {
  pickedMessageId.value = messageId;
  pickedChannelId.value = channelId;
  showManualIds.value = false;
}

function hasRealAvatar(url: string | undefined): boolean {
  return !!url && isTrustedMediaUrl(url);
}

function initial(label: string): string {
  return (label.trim()[0] ?? '?').toUpperCase();
}

function labelHue(label: string): number {
  let h = 0;
  for (let i = 0; i < label.length; i++)
    h = (h * 31 + label.charCodeAt(i)) & 0xffff;
  return h % 360;
}

async function handleSubmit() {
  const ctx = context.value;
  if (!ctx || submitting.value || !canSubmit.value) return;
  // The app uses cookie-based (BFF) auth — accessToken is always null for
  // normal sessions and the transport ignores it. Trust isAuthenticated alone.
  const token = authSession.accessToken?.trim() ?? '';
  if (!authSession.isAuthenticated) {
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
              targetUserId:
                pickedUserId.value.trim() || generalTargetUserId.value,
              messageId: pickedMessageId.value.trim() || generalMessageId.value,
              channelId: pickedChannelId.value.trim() || generalChannelId.value,
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
    <Transition name="report-overlay">
      <div
        v-if="isOpen && context"
        class="report-modal-overlay fixed inset-0 z-[10000] flex items-center justify-center px-4 py-6 bg-overlay-dim backdrop-blur-sm"
        @click.self="handleClose"
      >
        <Transition name="report-card">
          <div
            v-if="isOpen && context"
            ref="modalRef"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-modal-title"
            class="report-modal-panel relative flex w-full max-w-[520px] max-h-[min(40rem,92vh)] flex-col overflow-hidden rounded-3xl text-[var(--text)]"
            @click.stop
          >
            <div
              class="report-top-accent pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-3xl"
              aria-hidden="true"
            />

            <button
              type="button"
              class="chat-focus-ring absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-glass-hover hover:text-[var(--text)]"
              aria-label="Close"
              @click="handleClose"
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

            <div
              class="relative shrink-0 border-b border-[var(--border)] px-5 pb-4 pt-5 pr-12"
            >
              <h2
                id="report-modal-title"
                class="text-lg font-bold leading-tight tracking-tight"
              >
                {{ title }}
              </h2>
              <p class="mt-1 text-sm text-[var(--muted)]">
                {{ subtitle }}
              </p>

              <div
                v-if="targetCard"
                class="mt-3 flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
              >
                <div
                  class="report-avatar-initial flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  :style="`--_hue: ${labelHue(targetCard.label)}`"
                >
                  {{ initial(targetCard.label) }}
                </div>
                <div class="min-w-0 flex-1">
                  <span class="text-sm font-semibold text-[var(--text)]">{{
                    targetCard.label
                  }}</span>
                  <p
                    v-if="targetCard.kind === 'message' && targetCard.preview"
                    class="mt-1 line-clamp-3 text-sm leading-snug text-[var(--muted)]"
                  >
                    {{ targetCard.preview }}
                  </p>
                </div>
              </div>
            </div>

            <div
              class="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4"
            >
              <template v-if="context.kind === 'general'">
                <div
                  class="flex rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1"
                  role="tablist"
                  aria-label="Report type"
                >
                  <button
                    type="button"
                    role="tab"
                    :aria-selected="generalTargetType === 'user'"
                    class="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
                    :class="
                      generalTargetType === 'user'
                        ? 'bg-[var(--accent)]/15 text-[var(--text)] shadow-sm'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    "
                    @click="generalTargetType = 'user'"
                  >
                    Report someone
                  </button>
                  <button
                    type="button"
                    role="tab"
                    :aria-selected="generalTargetType === 'message'"
                    class="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
                    :class="
                      generalTargetType === 'message'
                        ? 'bg-[var(--accent)]/15 text-[var(--text)] shadow-sm'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    "
                    @click="generalTargetType = 'message'"
                  >
                    Report a message
                  </button>
                </div>

                <div class="relative mt-3">
                  <img
                    :src="icons.search"
                    alt=""
                    class="report-search-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    ref="targetSearchRef"
                    v-model="targetSearchQuery"
                    type="search"
                    class="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-10 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)]"
                    :placeholder="
                      generalTargetType === 'user'
                        ? 'Search friends and members…'
                        : pickedChannelId
                          ? 'Search messages in this channel…'
                          : 'Search channels…'
                    "
                    autocomplete="off"
                  />
                </div>

                <template v-if="generalTargetType === 'user'">
                  <div
                    v-if="pickedUser"
                    class="mt-3 flex items-center gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2"
                  >
                    <img
                      v-if="hasRealAvatar(pickedUser.avatarUrl)"
                      :src="pickedUser.avatarUrl"
                      alt=""
                      class="h-8 w-8 rounded-full object-cover"
                    />
                    <div
                      v-else
                      class="report-avatar-initial flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                      :style="`--_hue: ${labelHue(pickedUser.name)}`"
                    >
                      {{ initial(pickedUser.name) }}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-sm font-semibold">
                        {{ pickedUser.name }}
                      </div>
                      <div
                        v-if="pickedUser.username"
                        class="truncate text-xs text-[var(--muted)]"
                      >
                        @{{ pickedUser.username }}
                      </div>
                    </div>
                    <button
                      type="button"
                      class="text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]"
                      @click="pickedUserId = ''"
                    >
                      Change
                    </button>
                  </div>

                  <div v-else-if="userCandidates.length" class="mt-2 space-y-1">
                    <button
                      v-for="user in userCandidates.slice(0, 12)"
                      :key="user.id"
                      type="button"
                      class="chat-focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-glass-hover"
                      @click="selectUser(user.id)"
                    >
                      <img
                        v-if="hasRealAvatar(user.avatarUrl)"
                        :src="user.avatarUrl"
                        alt=""
                        class="h-8 w-8 rounded-full object-cover"
                      />
                      <div
                        v-else
                        class="report-avatar-initial flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                        :style="`--_hue: ${labelHue(user.name)}`"
                      >
                        {{ initial(user.name) }}
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="truncate text-sm font-medium">
                          {{ user.name }}
                          <span
                            v-if="user.isFriend"
                            class="ml-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]"
                            >Friend</span
                          >
                        </div>
                        <div
                          v-if="user.username"
                          class="truncate text-xs text-[var(--muted)]"
                        >
                          @{{ user.username }}
                        </div>
                      </div>
                    </button>
                  </div>
                  <p
                    v-else
                    class="mt-4 text-center text-sm text-[var(--muted)]"
                  >
                    No people match your search. Try another name or use manual
                    entry below.
                  </p>
                </template>

                <template v-else>
                  <div
                    v-if="pickedChannel"
                    class="mt-3 flex items-center justify-between gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2"
                  >
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold">
                        {{ pickedChannel.channelLabel }}
                      </div>
                      <div class="truncate text-xs text-[var(--muted)]">
                        {{ pickedChannel.serverName }}
                      </div>
                    </div>
                    <button
                      type="button"
                      class="shrink-0 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]"
                      @click="
                        pickedChannelId = '';
                        pickedMessageId = '';
                      "
                    >
                      Change channel
                    </button>
                  </div>

                  <div
                    v-else-if="channelCandidates.length"
                    class="mt-2 space-y-1"
                  >
                    <button
                      v-for="ch in channelCandidates.slice(0, 14)"
                      :key="ch.channelId"
                      type="button"
                      class="chat-focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-glass-hover"
                      @click="selectChannel(ch.channelId)"
                    >
                      <div
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-glass-2 text-sm font-bold text-[var(--muted)]"
                      >
                        #
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="truncate text-sm font-medium">
                          {{ ch.channelLabel }}
                        </div>
                        <div class="truncate text-xs text-[var(--muted)]">
                          {{ ch.serverName }}
                        </div>
                      </div>
                    </button>
                  </div>
                  <p
                    v-else-if="!pickedChannelId"
                    class="mt-4 text-center text-sm text-[var(--muted)]"
                  >
                    No channels match. Open a server first or use manual entry
                    below.
                  </p>

                  <template v-if="pickedChannelId">
                    <div
                      v-if="pickedMessage"
                      class="mt-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2"
                    >
                      <div class="text-xs font-semibold text-[var(--muted)]">
                        {{ pickedMessage.authorName }}
                      </div>
                      <p class="mt-1 line-clamp-2 text-sm">
                        {{ pickedMessage.preview }}
                      </p>
                      <button
                        type="button"
                        class="mt-2 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]"
                        @click="pickedMessageId = ''"
                      >
                        Pick a different message
                      </button>
                    </div>
                    <div
                      v-else-if="messageCandidates.length"
                      class="mt-2 space-y-1"
                    >
                      <button
                        v-for="msg in messageCandidates"
                        :key="msg.messageId"
                        type="button"
                        class="chat-focus-ring w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-glass-hover"
                        @click="selectMessage(msg.messageId, msg.channelId)"
                      >
                        <div class="text-xs font-semibold text-[var(--muted)]">
                          {{ msg.authorName }}
                        </div>
                        <p class="mt-0.5 line-clamp-2 text-sm">
                          {{ msg.preview }}
                        </p>
                      </button>
                    </div>
                    <p
                      v-else
                      class="mt-4 text-center text-sm text-[var(--muted)]"
                    >
                      No messages loaded in this channel yet. Scroll the chat to
                      load history, or use manual entry below.
                    </p>
                  </template>
                </template>

                <button
                  type="button"
                  class="mt-4 text-xs font-medium text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
                  @click="showManualIds = !showManualIds"
                >
                  {{
                    showManualIds
                      ? 'Hide manual entry'
                      : "Can't find them? Enter IDs manually"
                  }}
                </button>

                <div
                  v-if="showManualIds"
                  class="mt-2 space-y-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <label
                    v-if="generalTargetType === 'user'"
                    class="block text-xs font-medium text-[var(--text)]"
                  >
                    User ID
                    <input
                      v-model="generalTargetUserId"
                      type="text"
                      class="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--echo-modal-bg,var(--surface))] px-3 py-2 text-sm"
                      placeholder="Paste user ID"
                      autocomplete="off"
                      @input="pickedUserId = ''"
                    />
                  </label>
                  <template v-else>
                    <label class="block text-xs font-medium text-[var(--text)]">
                      Message ID
                      <input
                        v-model="generalMessageId"
                        type="text"
                        class="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--echo-modal-bg,var(--surface))] px-3 py-2 text-sm"
                        placeholder="Paste message ID"
                        autocomplete="off"
                        @input="pickedMessageId = ''"
                      />
                    </label>
                    <label class="block text-xs font-medium text-[var(--text)]">
                      Channel ID
                      <input
                        v-model="generalChannelId"
                        type="text"
                        class="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--echo-modal-bg,var(--surface))] px-3 py-2 text-sm"
                        placeholder="Paste channel ID"
                        autocomplete="off"
                        @input="pickedChannelId = ''"
                      />
                    </label>
                  </template>
                </div>
              </template>

              <fieldset class="mt-1">
                <legend class="mb-2 text-sm font-semibold text-[var(--text)]">
                  What is this report about?
                </legend>
                <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    v-for="opt in categoryOptions"
                    :key="opt.id"
                    type="button"
                    class="chat-focus-ring rounded-xl border px-3 py-2.5 text-left transition-colors"
                    :class="
                      category === opt.id
                        ? 'border-[var(--accent)] bg-[var(--accent)]/12'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/40'
                    "
                    @click="category = opt.id"
                  >
                    <div class="text-sm font-semibold">{{ opt.label }}</div>
                    <div
                      class="mt-0.5 text-xs leading-snug text-[var(--muted)]"
                    >
                      {{ opt.hint }}
                    </div>
                  </button>
                </div>
              </fieldset>

              <label class="mt-4 block text-sm font-medium text-[var(--text)]">
                Additional details
                <textarea
                  ref="reasonInputRef"
                  v-model="reason"
                  class="mt-1 w-full min-h-[88px] resize-y rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
                  maxlength="2000"
                  placeholder="Tell us what happened (optional)"
                />
              </label>
            </div>

            <div class="shrink-0 border-t border-[var(--border)] px-5 py-4">
              <p
                v-if="errorMessage"
                class="mb-3 text-sm text-red-400"
                role="alert"
              >
                {{ errorMessage }}
              </p>
              <div class="flex justify-end gap-2">
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
                  :disabled="submitting || !canSubmit"
                  @click="handleSubmit"
                >
                  {{ submitting ? 'Submitting…' : 'Submit report' }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.report-modal-overlay {
  background-color: var(--overlay-dim);
}

.report-modal-panel {
  background: var(--echo-modal-bg, var(--surface));
  border: 1px solid var(--border);
  box-shadow: var(--shadow-4);
  backdrop-filter: blur(24px) saturate(1.3);
  -webkit-backdrop-filter: blur(24px) saturate(1.3);
}

.report-search-icon {
  filter: var(--echo-ink-icon-filter);
  opacity: 0.55;
}

.report-top-accent {
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--accent) 12%, transparent) 0%,
    transparent 100%
  );
}

.report-avatar-initial {
  background: hsl(var(--_hue), 35%, 28%);
  color: var(--ui-fg-soft);
}
[data-theme='light'] .report-avatar-initial {
  background: hsl(var(--_hue), 42%, 88%);
  color: hsl(var(--_hue), 40%, 32%);
}

.report-overlay-enter-active,
.report-overlay-leave-active {
  transition: opacity 0.18s ease;
}
.report-overlay-enter-from,
.report-overlay-leave-to {
  opacity: 0;
}

.report-card-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.34, 1.3, 0.64, 1);
}
.report-card-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.report-card-enter-from,
.report-card-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(6px);
}
</style>
