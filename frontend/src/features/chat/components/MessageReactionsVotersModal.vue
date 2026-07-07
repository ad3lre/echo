<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import type { MessageReaction } from '@shared/types';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useEchoMessageReactionsFetch } from '@/features/chat/composables/useEchoMessageReactionsFetch';
import { useAuthSessionStore } from '@/stores/authSession';

const props = defineProps<{
  modelValue: boolean;
  reactions: MessageReaction[];
  channelId?: string;
  /** Short excerpt under the title (like poll question in PollDisplay). */
  messagePreview?: string;
  messageId?: string;
  currentUserId?: string;
  currentUserDisplayName?: string;
  resolvePollVoterDisplay?: (userId: string) => string;
  resolvePollVoterAvatar?: (userId: string) => string | undefined;
  /** Renders unicode + custom reaction emoji HTML for tab labels. */
  parseReactionEmoji: (emoji: string) => string;
}>();

const emit = defineEmits<{
  'update:modelValue': [open: boolean];
}>();

const authSession = useAuthSessionStore();
const {
  loadedReactions,
  loading: votersLoading,
  loadError: votersLoadError,
  reset: resetVotersFetch,
  load: loadVoters,
} = useEchoMessageReactionsFetch(computed(() => authSession.accessToken));
const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const activeTabIdx = ref(0);

const displayReactions = computed(
  () => loadedReactions.value ?? props.reactions,
);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      resetVotersFetch();
      return;
    }
    activeTabIdx.value = 0;
    void Promise.resolve().then(() => {
      modalRef.value?.focus();
    });
    const channelId = props.channelId?.trim();
    const messageId = props.messageId?.trim();
    if (!channelId || !messageId) return;
    void loadVoters(channelId, messageId);
  },
);

watch(
  () => displayReactions.value,
  () => {
    if (activeTabIdx.value >= displayReactions.value.length) {
      activeTabIdx.value = Math.max(0, displayReactions.value.length - 1);
    }
  },
);

const voterRowsByReaction = computed(() => {
  return displayReactions.value.map((r) => {
    const labels = r.userIds
      .map((id) => ({
        id,
        label: voterLabel(id),
      }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
      );
    return { reaction: r, voters: labels };
  });
});

function voterLabel(userId: string): string {
  if (props.resolvePollVoterDisplay) {
    return props.resolvePollVoterDisplay(userId);
  }
  const uid = props.currentUserId;
  if (uid && userId === uid) {
    return props.currentUserDisplayName?.trim() || 'You';
  }
  return 'Unknown';
}

function isUsableAvatarUrl(url: string | undefined | null): boolean {
  if (!url?.trim()) return false;
  const t = url.trim();
  if (t.startsWith('//')) return true;
  return (
    t.startsWith('http://') ||
    t.startsWith('https://') ||
    t.startsWith('data:') ||
    t.startsWith('/')
  );
}

function voterAvatarSrc(userId: string): string | null {
  const raw = props.resolvePollVoterAvatar?.(userId)?.trim();
  if (!raw || !isUsableAvatarUrl(raw)) return null;
  return safeImageUrl(raw);
}

function voterInitials(label: string): string {
  const t = label.trim();
  if (!t) return '?';
  const first = [...t][0];
  return first ? first.toUpperCase() : '?';
}

function onTabKeydown(e: KeyboardEvent, fromIdx: number) {
  const n = displayReactions.value.length;
  if (n === 0) return;
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  e.preventDefault();
  const idx = fromIdx < 0 ? 0 : fromIdx;
  const next = e.key === 'ArrowRight' ? (idx + 1) % n : (idx - 1 + n) % n;
  activeTabIdx.value = next;
  void Promise.resolve().then(() => {
    document.getElementById(`msg-reactions-tab-${tabDomId(next)}`)?.focus();
  });
}

function tabDomId(idx: number): string {
  const mid = props.messageId?.replace(/[^a-zA-Z0-9_-]/g, '') ?? 'm';
  return `${mid}-${idx}`;
}

function close() {
  emit('update:modelValue', false);
}

const totalReactors = computed(() => {
  const s = new Set<string>();
  for (const r of displayReactions.value) {
    for (const id of r.userIds) s.add(id);
  }
  return s.size;
});
</script>

<template>
  <Teleport v-if="modelValue && displayReactions.length > 0" to="body">
    <div
      class="msg-reactions-voters-overlay fixed inset-0 z-[100] flex items-center justify-center px-4 modal-overlay-bg"
      role="presentation"
      @click.self="close"
    >
      <div
        ref="modalRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="msg-reactions-voters-title"
        tabindex="-1"
        class="real-glass-modal msg-reactions-voters-modal relative flex w-full max-w-md flex-col overflow-hidden rounded-xl p-6 text-foreground bg-transparent pointer-events-auto"
        @click.stop
      >
        <h2
          id="msg-reactions-voters-title"
          class="shrink-0 text-lg font-semibold pr-8"
        >
          Who reacted
        </h2>
        <p
          v-if="messagePreview?.trim()"
          class="mt-1 shrink-0 text-sm text-muted line-clamp-2"
        >
          {{ messagePreview.trim() }}
        </p>
        <button
          type="button"
          class="absolute top-4 right-4 p-1.5 rounded-md text-muted hover:text-foreground hover:bg-glass-hover transition-colors"
          aria-label="Close"
          @click="close"
        >
          <svg
            class="w-5 h-5"
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
        <div
          class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted shrink-0"
        >
          <span class="tabular-nums">
            {{ totalReactors }}
            {{ totalReactors === 1 ? 'person' : 'people' }} ·
            {{ displayReactions.length }}
            {{ displayReactions.length === 1 ? 'emoji' : 'emojis' }}
          </span>
          <span v-if="votersLoading" class="text-muted">Loading…</span>
          <span v-else-if="votersLoadError" class="text-muted"
            >Could not load full list</span
          >
        </div>
        <div
          role="tablist"
          aria-label="Reactors by emoji"
          class="mt-4 flex gap-1 overflow-x-auto pb-2 -mx-1 px-1 custom-scrollbar shrink-0 border-b border-border"
        >
          <button
            v-for="(r, i) in displayReactions"
            :id="`msg-reactions-tab-${tabDomId(i)}`"
            :key="`${messageId ?? ''}-${i}-${r.emoji}`"
            type="button"
            role="tab"
            :aria-selected="activeTabIdx === i"
            :aria-controls="`msg-reactions-panel-${tabDomId(i)}`"
            :tabindex="activeTabIdx === i ? 0 : -1"
            class="shrink-0 flex max-w-[11rem] items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors"
            :class="
              activeTabIdx === i
                ? 'bg-indigo-500/25 text-foreground ring-1 ring-indigo-400/40'
                : 'text-muted hover:text-foreground hover:bg-glass-1'
            "
            @click="activeTabIdx = i"
            @keydown="onTabKeydown($event, i)"
          >
            <span
              class="msg-reactions-tab-emoji shrink-0 inline-flex items-center justify-center"
              v-html="parseReactionEmoji(r.emoji)"
            />
            <span
              class="tabular-nums shrink-0 rounded-md bg-scrim-1 px-1.5 py-0.5 text-[10px] text-muted"
              >{{ r.count }}</span
            >
          </button>
        </div>
        <div
          class="msg-reactions-voters-modal__scroll mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pr-1"
        >
          <template
            v-for="(row, i) in voterRowsByReaction"
            :key="`${messageId ?? ''}-${i}-${row.reaction.emoji}`"
          >
            <div
              v-show="i === activeTabIdx"
              :id="`msg-reactions-panel-${tabDomId(i)}`"
              role="tabpanel"
              :aria-labelledby="`msg-reactions-tab-${tabDomId(i)}`"
              class="min-h-0 outline-none"
            >
              <ul v-if="row.voters.length > 0" class="space-y-1.5">
                <li
                  v-for="v in row.voters"
                  :key="v.id"
                  class="flex items-center gap-2.5 rounded-lg py-1.5 pl-1 pr-2 hover:bg-glass-hover transition-colors"
                >
                  <div
                    class="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-white/15 to-white/5 ring-1 ring-border"
                  >
                    <PausedGifAvatar
                      v-if="voterAvatarSrc(v.id)"
                      :src="voterAvatarSrc(v.id)!"
                      :alt="v.label"
                      :session-key="v.id"
                      img-class="rounded-full object-cover"
                    />
                    <span
                      v-else
                      class="flex h-full w-full items-center justify-center text-xs font-semibold text-foreground/80"
                    >
                      {{ voterInitials(v.label) }}
                    </span>
                  </div>
                  <span
                    class="min-w-0 flex-1 truncate text-sm text-foreground/95"
                    >{{ v.label }}</span
                  >
                </li>
              </ul>
              <p v-else class="py-6 text-center text-sm text-muted/80 italic">
                No reactors for this emoji
              </p>
            </div>
          </template>
        </div>
        <div class="mt-4 flex shrink-0 justify-end">
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:text-foreground hover:bg-glass-hover transition-colors"
            @click="close"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.modal-overlay-bg {
  background-color: var(--vue-auto-011);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.msg-reactions-voters-overlay {
  pointer-events: auto;
  isolation: isolate;
}

.msg-reactions-voters-modal {
  height: min(28rem, calc(100vh - 3rem));
  height: min(28rem, calc(100dvh - 3rem));
}

.msg-reactions-voters-modal__scroll {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
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

.msg-reactions-tab-emoji :deep(img.emoji),
.msg-reactions-tab-emoji :deep(img.custom-emoji) {
  width: 1.1em;
  height: 1.1em;
  max-width: 1.1em;
  max-height: 1.1em;
  object-fit: contain;
  vertical-align: -0.15em;
  display: inline-block;
}
</style>
