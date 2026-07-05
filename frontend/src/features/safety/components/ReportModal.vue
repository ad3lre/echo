<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
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
const submitted = ref(false);
const errorMessage = ref<string | null>(null);

let closeAfterSuccessTimer: ReturnType<typeof setTimeout> | null = null;

onUnmounted(() => {
  if (closeAfterSuccessTimer) clearTimeout(closeAfterSuccessTimer);
});

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
}));

const selectedCategoryHint = computed(
  () => REPORT_CATEGORY_HINTS[category.value],
);

const needsScrollBody = computed(() => context.value?.kind === 'general');

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
  if (!ctx || submitting.value || submitted.value) return false;
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

function clearCloseAfterSuccessTimer() {
  if (closeAfterSuccessTimer) {
    clearTimeout(closeAfterSuccessTimer);
    closeAfterSuccessTimer = null;
  }
}

function resetForm() {
  category.value = 'other';
  reason.value = '';
  errorMessage.value = null;
  submitted.value = false;
  clearCloseAfterSuccessTimer();
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
  if (submitting.value) return;
  clearCloseAfterSuccessTimer();
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
    submitted.value = true;
    dispatchAppToast('Report submitted. Thank you.', 'success');
    clearCloseAfterSuccessTimer();
    closeAfterSuccessTimer = setTimeout(() => {
      closeAfterSuccessTimer = null;
      closeReportModal();
    }, 1400);
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
        class="fixed inset-0 z-[160] flex items-center justify-center px-4 py-6 bg-overlay-dim backdrop-blur-sm"
        @click.self="handleClose"
      >
        <Transition name="report-card">
          <div
            v-if="isOpen && context"
            ref="modalRef"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-modal-title"
            class="report-card relative flex w-full max-w-[520px] flex-col overflow-hidden rounded-3xl text-foreground"
            :class="
              needsScrollBody
                ? 'max-h-[min(44rem,94vh)]'
                : 'max-h-[min(36rem,94vh)]'
            "
            @click.stop
          >
            <Transition name="report-success">
              <div
                v-if="submitted"
                class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-3xl bg-overlay-heavy px-6 text-center backdrop-blur-sm"
                role="status"
                aria-live="polite"
              >
                <div
                  class="report-success-ring flex h-16 w-16 items-center justify-center rounded-full"
                >
                  <svg
                    class="report-success-check h-8 w-8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <div>
                  <p class="text-base font-semibold text-foreground">
                    Report submitted
                  </p>
                  <p class="mt-1 text-sm text-fg-subtle">
                    Thank you — our Trust &amp; Safety team will review it.
                  </p>
                </div>
              </div>
            </Transition>

            <div
              class="report-top-accent pointer-events-none absolute inset-x-0 top-0 h-20 rounded-t-3xl"
              aria-hidden="true"
            />

            <button
              type="button"
              class="report-close-btn chat-focus-ring absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-glass-hover hover:text-foreground"
              aria-label="Close"
              :disabled="submitting"
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
              class="relative shrink-0 border-b border-border px-5 pb-4 pt-5 pr-12"
            >
              <div class="flex items-start gap-3">
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 ring-1 ring-rose-500/25"
                  aria-hidden="true"
                >
                  <img
                    :src="icons.shield"
                    alt=""
                    class="echo-ink-icon h-5 w-5 opacity-90"
                  />
                </span>
                <div class="min-w-0 flex-1">
                  <h2
                    id="report-modal-title"
                    class="text-lg font-bold leading-tight tracking-tight text-foreground"
                  >
                    {{ title }}
                  </h2>
                  <p
                    v-if="!targetCard"
                    class="mt-0.5 text-sm leading-snug text-fg-subtle"
                  >
                    {{ subtitle }}
                  </p>
                </div>
              </div>

              <div
                v-if="targetCard"
                class="mt-3.5 flex items-start gap-2.5 rounded-xl bg-glass-2 px-3 py-2.5"
              >
                <div
                  class="report-avatar-initial flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  :style="`--_hue: ${labelHue(targetCard.label)}`"
                >
                  {{ initial(targetCard.label) }}
                </div>
                <div class="min-w-0 flex-1">
                  <span
                    class="block text-[10px] font-semibold uppercase tracking-widest text-fg-subtle"
                  >
                    {{
                      targetCard.kind === 'user'
                        ? 'Reporting'
                        : 'Message preview'
                    }}
                  </span>
                  <span
                    class="mt-0.5 block text-sm font-semibold text-foreground"
                    >{{ targetCard.label }}</span
                  >
                  <p
                    v-if="targetCard.kind === 'message' && targetCard.preview"
                    class="mt-0.5 line-clamp-2 text-sm leading-snug text-fg-soft"
                  >
                    {{ targetCard.preview }}
                  </p>
                </div>
              </div>
            </div>

            <div
              class="px-5 py-3"
              :class="
                needsScrollBody
                  ? 'custom-scrollbar min-h-0 flex-1 overflow-y-auto'
                  : 'shrink-0'
              "
            >
              <template v-if="context.kind === 'general'">
                <div
                  class="flex rounded-xl border border-border bg-elevated p-1"
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
                        ? 'bg-accent text-[var(--accent-contrast-fg)]'
                        : 'text-muted hover:bg-glass-hover hover:text-foreground'
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
                        ? 'bg-accent text-[var(--accent-contrast-fg)]'
                        : 'text-muted hover:bg-glass-hover hover:text-foreground'
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
                    class="w-full rounded-xl border border-border bg-glass-2 py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-fg-subtle outline-none transition-colors focus:border-border focus:bg-glass-2"
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
                    class="mt-3 flex items-center gap-3 rounded-xl border border-rose-400/35 bg-rose-500/10 px-3 py-2 ring-1 ring-rose-400/25"
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
                        class="truncate text-xs text-fg-subtle"
                      >
                        @{{ pickedUser.username }}
                      </div>
                    </div>
                    <button
                      type="button"
                      class="text-xs font-medium text-fg-subtle transition-colors hover:text-foreground"
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
                            class="ml-1 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle"
                            >Friend</span
                          >
                        </div>
                        <div
                          v-if="user.username"
                          class="truncate text-xs text-fg-subtle"
                        >
                          @{{ user.username }}
                        </div>
                      </div>
                    </button>
                  </div>
                  <p v-else class="mt-4 text-center text-sm text-fg-subtle">
                    No people match your search. Try another name or use manual
                    entry below.
                  </p>
                </template>

                <template v-else>
                  <div
                    v-if="pickedChannel"
                    class="mt-3 flex items-center justify-between gap-2 rounded-xl border border-rose-400/35 bg-rose-500/10 px-3 py-2 ring-1 ring-rose-400/25"
                  >
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold">
                        {{ pickedChannel.channelLabel }}
                      </div>
                      <div class="truncate text-xs text-fg-subtle">
                        {{ pickedChannel.serverName }}
                      </div>
                    </div>
                    <button
                      type="button"
                      class="shrink-0 text-xs font-medium text-fg-subtle transition-colors hover:text-foreground"
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
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-glass-2 text-sm font-bold text-fg-subtle"
                      >
                        #
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="truncate text-sm font-medium">
                          {{ ch.channelLabel }}
                        </div>
                        <div class="truncate text-xs text-fg-subtle">
                          {{ ch.serverName }}
                        </div>
                      </div>
                    </button>
                  </div>
                  <p
                    v-else-if="!pickedChannelId"
                    class="mt-4 text-center text-sm text-fg-subtle"
                  >
                    No channels match. Open a server first or use manual entry
                    below.
                  </p>

                  <template v-if="pickedChannelId">
                    <div
                      v-if="pickedMessage"
                      class="mt-3 rounded-xl border border-rose-400/35 bg-rose-500/10 px-3 py-2 ring-1 ring-rose-400/25"
                    >
                      <div class="text-xs font-semibold text-fg-subtle">
                        {{ pickedMessage.authorName }}
                      </div>
                      <p class="mt-1 line-clamp-2 text-sm">
                        {{ pickedMessage.preview }}
                      </p>
                      <button
                        type="button"
                        class="mt-2 text-xs font-medium text-fg-subtle transition-colors hover:text-foreground"
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
                        <div class="text-xs font-semibold text-fg-subtle">
                          {{ msg.authorName }}
                        </div>
                        <p class="mt-0.5 line-clamp-2 text-sm">
                          {{ msg.preview }}
                        </p>
                      </button>
                    </div>
                    <p v-else class="mt-4 text-center text-sm text-fg-subtle">
                      No messages loaded in this channel yet. Scroll the chat to
                      load history, or use manual entry below.
                    </p>
                  </template>
                </template>

                <button
                  type="button"
                  class="mt-4 text-xs font-medium text-fg-subtle underline-offset-2 transition-colors hover:text-foreground hover:underline"
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
                  class="mt-2 space-y-3 rounded-xl border border-dashed border-border bg-scrim-1 p-3"
                >
                  <label
                    v-if="generalTargetType === 'user'"
                    class="block text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                  >
                    User ID
                    <input
                      v-model="generalTargetUserId"
                      type="text"
                      class="mt-1.5 w-full rounded-lg border border-border bg-scrim-2 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-rose-400/40 focus:ring-1 focus:ring-rose-400/30"
                      placeholder="Paste user ID"
                      autocomplete="off"
                      @input="pickedUserId = ''"
                    />
                  </label>
                  <template v-else>
                    <label
                      class="block text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                    >
                      Message ID
                      <input
                        v-model="generalMessageId"
                        type="text"
                        class="mt-1.5 w-full rounded-lg border border-border bg-scrim-2 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-rose-400/40 focus:ring-1 focus:ring-rose-400/30"
                        placeholder="Paste message ID"
                        autocomplete="off"
                        @input="pickedMessageId = ''"
                      />
                    </label>
                    <label
                      class="block text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                    >
                      Channel ID
                      <input
                        v-model="generalChannelId"
                        type="text"
                        class="mt-1.5 w-full rounded-lg border border-border bg-scrim-2 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-rose-400/40 focus:ring-1 focus:ring-rose-400/30"
                        placeholder="Paste channel ID"
                        autocomplete="off"
                        @input="pickedChannelId = ''"
                      />
                    </label>
                  </template>
                </div>
              </template>

              <fieldset class="mt-1">
                <legend
                  class="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                >
                  Category
                </legend>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="opt in categoryOptions"
                    :key="opt.id"
                    type="button"
                    class="chat-focus-ring rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                    :class="
                      category === opt.id
                        ? 'bg-rose-500/35 text-foreground ring-1 ring-rose-400/45'
                        : 'bg-glass-1 text-fg-soft hover:bg-glass-2'
                    "
                    @click="category = opt.id"
                  >
                    {{ opt.label }}
                  </button>
                </div>
                <p class="mt-2 text-xs leading-snug text-fg-subtle">
                  {{ selectedCategoryHint }}
                </p>
              </fieldset>

              <label class="mt-4 block">
                <span
                  class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                >
                  Additional details
                  <span
                    class="font-normal normal-case tracking-normal text-fg-subtle"
                    >(optional)</span
                  >
                </span>
                <textarea
                  ref="reasonInputRef"
                  v-model="reason"
                  rows="2"
                  class="mt-2 w-full min-h-[4.5rem] resize-y rounded-xl border border-border bg-scrim-1 px-3 py-2 text-sm text-foreground placeholder:text-fg-subtle focus:border-rose-400/40 focus:outline-none focus:ring-1 focus:ring-rose-400/30"
                  maxlength="2000"
                  placeholder="Tell us what happened"
                />
              </label>
            </div>

            <div class="shrink-0 border-t border-border px-5 py-3.5">
              <p
                v-if="errorMessage"
                class="mb-2.5 text-sm text-rose-400"
                role="alert"
              >
                {{ errorMessage }}
              </p>
              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  class="rounded-lg px-4 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-foreground"
                  :disabled="submitting || submitted"
                  @click="handleClose"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-rose-600/85 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
                  :disabled="submitting || submitted || !canSubmit"
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
.report-card {
  background: var(--echo-modal-bg);
  backdrop-filter: blur(24px) saturate(1.3);
  -webkit-backdrop-filter: blur(24px) saturate(1.3);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-4);
}

.report-search-icon {
  filter: var(--echo-ink-icon-filter);
  opacity: 0.55;
}

.report-top-accent {
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, rgb(244 63 94) 18%, transparent) 0%,
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

.report-success-ring {
  background: rgba(16, 185, 129, 0.2);
  box-shadow: inset 0 0 0 1px rgba(52, 211, 153, 0.3);
}
[data-theme='light'] .report-success-ring {
  background: rgba(16, 185, 129, 0.12);
  box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.25);
}

.report-success-check {
  color: #34d399;
}
[data-theme='light'] .report-success-check {
  color: #059669;
}

.report-success-enter-active {
  transition: opacity 0.18s ease;
}
.report-success-enter-from {
  opacity: 0;
}
</style>
