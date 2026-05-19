<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import type { PollData, PollOption } from '@shared/types';
import { formatPollTimeRemaining, isPollEnded } from '@/utils/formatPollTime';
import PollOptionEmoji from '@/components/chat/PollOptionEmoji.vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { useFocusTrap } from '@/composables/useFocusTrap';

const props = defineProps<{
  poll: PollData;
  messageId?: string;
  currentUserId?: string;
  /** Shown for the current user in the voters list when no resolver is provided. */
  currentUserDisplayName?: string;
  resolvePollVoterDisplay?: (userId: string) => string;
  /** Optional avatar URL for a voter id (e.g. from member list). */
  resolvePollVoterAvatar?: (userId: string) => string | undefined;
}>();

const emit = defineEmits<{
  vote: [optionId: string];
}>();

const votersModalOpen = ref(false);
const activeVoterTabOptionId = ref('');
const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, votersModalOpen);

watch(votersModalOpen, (open) => {
  if (!open) return;
  activeVoterTabOptionId.value = props.poll.options[0]?.id ?? '';
  void Promise.resolve().then(() => {
    modalRef.value?.focus();
  });
});

const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  if (props.poll.endsAt) {
    ticker = setInterval(() => {
      now.value = Date.now();
    }, 60_000);
  }
});
onUnmounted(() => {
  if (ticker) clearInterval(ticker);
});

const totalVotes = computed(() =>
  props.poll.options.reduce((sum, o) => sum + o.votes, 0),
);

const ended = computed(() => isPollEnded(props.poll.endsAt));

const userHasVotedAny = computed(() => {
  const uid = props.currentUserId;
  if (!uid) return false;
  return props.poll.options.some((o) => o.voterIds.includes(uid));
});

const showVoteTallies = computed(() => {
  if (ended.value) return true;
  if (!props.currentUserId) return true;
  return userHasVotedAny.value;
});

const timeLabel = computed(() =>
  formatPollTimeRemaining(props.poll.endsAt, now.value),
);

const showWhoVotedUi = computed(() => props.poll.anonymous !== true);

const voterRowsByOption = computed(() => {
  return props.poll.options.map((opt) => {
    const labels = opt.voterIds
      .map((id) => ({
        id,
        label: voterLabel(id),
      }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
      );
    return { option: opt, voters: labels };
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

function onVoterTabKeydown(e: KeyboardEvent, fromOptionId: string) {
  const opts = props.poll.options;
  if (opts.length === 0) return;
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  e.preventDefault();
  const i = opts.findIndex((o) => o.id === fromOptionId);
  const idx = i < 0 ? 0 : i;
  const next =
    e.key === 'ArrowRight'
      ? (idx + 1) % opts.length
      : (idx - 1 + opts.length) % opts.length;
  const nextId = opts[next]!.id;
  activeVoterTabOptionId.value = nextId;
  void Promise.resolve().then(() => {
    document.getElementById(`poll-voters-tab-${nextId}`)?.focus();
  });
}

function closeVotersModal() {
  votersModalOpen.value = false;
}

function getPercent(opt: PollOption) {
  if (totalVotes.value === 0) return 0;
  return Math.round((opt.votes / totalVotes.value) * 100);
}

function hasVoted(opt: PollOption) {
  return props.currentUserId && opt.voterIds.includes(props.currentUserId);
}

function handleVote(opt: PollOption) {
  if (hasVoted(opt) || ended.value) return;
  emit('vote', opt.id);
}
</script>

<template>
  <div
    class="mt-2 w-full max-w-[400px] rounded-lg border border-border bg-surface overflow-hidden"
  >
    <div class="px-4 py-4">
      <div class="text-sm font-medium text-foreground mb-3">
        {{ poll.question }}
      </div>
      <div class="space-y-1.5">
        <button
          v-for="opt in poll.options"
          :key="opt.id"
          type="button"
          class="w-full text-left rounded-md overflow-hidden transition-colors"
          :class="[
            hasVoted(opt) ? 'ring-1 ring-accent/40' : '',
            ended ? 'cursor-default opacity-80' : 'hover:bg-glass-hover',
          ]"
          :disabled="ended"
          @click="handleVote(opt)"
        >
          <div class="relative px-4 py-2.5">
            <div
              v-if="showVoteTallies"
              class="absolute left-0 top-0 bottom-0 z-0 bg-accent/15 transition-all duration-300"
              :style="{ width: `${getPercent(opt)}%` }"
            />
            <div class="relative z-10 flex items-center justify-between gap-2">
              <div class="flex min-w-0 flex-1 items-center gap-2 text-left">
                <PollOptionEmoji v-if="opt.emoji" :emoji="opt.emoji" />
                <span class="text-sm text-foreground truncate min-w-0">{{
                  opt.text
                }}</span>
              </div>
              <span
                v-if="showVoteTallies"
                class="text-xs text-muted shrink-0 tabular-nums"
              >
                {{ opt.votes }} {{ opt.votes === 1 ? 'vote' : 'votes' }}
                <template v-if="totalVotes > 0"
                  >{{ getPercent(opt) }}%</template
                >
              </span>
            </div>
          </div>
        </button>
      </div>
      <div
        class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted"
      >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          <span v-if="showVoteTallies" class="tabular-nums">
            {{ totalVotes }} {{ totalVotes === 1 ? 'vote' : 'votes' }} total
          </span>
          <span v-else class="text-muted/90">
            Results hidden until you vote
          </span>
          <button
            v-if="showWhoVotedUi"
            type="button"
            class="text-accent hover:brightness-110 transition-[filter,color] shrink-0 font-medium"
            @click="votersModalOpen = true"
          >
            View who voted
          </button>
        </div>
        <span
          v-if="timeLabel"
          class="shrink-0 tabular-nums"
          :class="ended ? 'poll-time--ended' : 'text-muted'"
        >
          {{ timeLabel }}
        </span>
      </div>
    </div>
  </div>

  <!-- Teleport: fixed layers inside virtualized message rows use the row as containing block
       (transform), which breaks hit-testing — same pattern as SearchBar / MemberList menus. -->
  <Teleport v-if="votersModalOpen && showWhoVotedUi" to="body">
    <div
      class="poll-voters-overlay fixed inset-0 z-[100] flex items-center justify-center px-4 modal-overlay-bg"
      role="presentation"
      @click.self="closeVotersModal"
    >
      <div
        ref="modalRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="poll-voters-title"
        tabindex="-1"
        class="real-glass-modal poll-voters-modal relative flex w-full max-w-md flex-col overflow-hidden rounded-xl p-6 text-foreground bg-transparent pointer-events-auto"
        @click.stop
      >
        <h2 id="poll-voters-title" class="shrink-0 text-lg font-semibold pr-8">
          Who voted
        </h2>
        <p class="mt-1 shrink-0 text-sm text-muted line-clamp-2">
          {{ poll.question }}
        </p>
        <button
          type="button"
          class="absolute top-4 right-4 p-1.5 rounded-md text-muted hover:text-foreground hover:bg-glass-hover transition-colors"
          aria-label="Close"
          @click="closeVotersModal"
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
          role="tablist"
          aria-label="Votes by answer"
          class="mt-4 flex gap-1 overflow-x-auto pb-2 -mx-1 px-1 custom-scrollbar shrink-0 border-b border-border"
        >
          <button
            v-for="opt in poll.options"
            :id="`poll-voters-tab-${opt.id}`"
            :key="opt.id"
            type="button"
            role="tab"
            :aria-selected="activeVoterTabOptionId === opt.id"
            :aria-controls="`poll-voters-panel-${opt.id}`"
            :tabindex="activeVoterTabOptionId === opt.id ? 0 : -1"
            class="shrink-0 flex max-w-[11rem] items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors"
            :class="
              activeVoterTabOptionId === opt.id
                ? 'bg-accent/15 text-foreground ring-1 ring-accent/35'
                : 'text-muted hover:text-foreground hover:bg-glass-hover'
            "
            @click="activeVoterTabOptionId = opt.id"
            @keydown="onVoterTabKeydown($event, opt.id)"
          >
            <PollOptionEmoji v-if="opt.emoji" :emoji="opt.emoji" />
            <span class="min-w-0 truncate">{{ opt.text }}</span>
            <span
              class="tabular-nums shrink-0 rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] text-muted"
              >{{ opt.votes }}</span
            >
          </button>
        </div>
        <div
          class="poll-voters-modal__scroll mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pr-1"
        >
          <template v-for="row in voterRowsByOption" :key="row.option.id">
            <div
              v-show="row.option.id === activeVoterTabOptionId"
              :id="`poll-voters-panel-${row.option.id}`"
              role="tabpanel"
              :aria-labelledby="`poll-voters-tab-${row.option.id}`"
              class="min-h-0 outline-none"
            >
              <ul v-if="row.voters.length > 0" class="space-y-1.5">
                <li
                  v-for="v in row.voters"
                  :key="v.id"
                  class="flex items-center gap-2.5 rounded-lg py-1.5 pl-1 pr-2 hover:bg-glass-hover transition-colors"
                >
                  <div
                    class="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted/20 ring-1 ring-border"
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
                No votes on this option yet
              </p>
            </div>
          </template>
        </div>
        <div class="mt-4 flex shrink-0 justify-end">
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:text-foreground hover:bg-glass-hover transition-colors"
            @click="closeVotersModal"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.poll-time--ended {
  color: color-mix(in srgb, var(--muted) 72%, var(--accent) 28%);
}

.modal-overlay-bg {
  background-color: color-mix(in srgb, var(--foreground) 28%, transparent);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.poll-voters-overlay {
  pointer-events: auto;
  isolation: isolate;
}

.poll-voters-modal {
  height: min(28rem, calc(100vh - 3rem));
  height: min(28rem, calc(100dvh - 3rem));
}

.poll-voters-modal__scroll {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.real-glass-modal {
  border: 1px solid var(--border);
  box-shadow: 0 4px 48px color-mix(in srgb, var(--foreground) 12%, transparent);
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background-color: color-mix(in srgb, var(--surface) 88%, transparent);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
  }
}
</style>
