<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { EchoHangmanActivityV1 } from '@/audio/voiceEchoLiveKitData';
import { VC_HANGMAN_MAX_WRONG } from '@/features/voice/vcHangmanReducer';
import { withBasePath } from '@/features/layout/urlNavigation';

const props = defineProps<{
  currentUserId?: string;
  hangmanActivity: EchoHangmanActivityV1 | null;
  hangmanRosterUserIds: string[];
  voiceParticipants: readonly { id: string; name: string }[];
  commitWord: (raw: string) => string | null;
  guessLetter: (letter: string) => void;
  nextRound: () => void;
}>();

const appBase = import.meta.env.BASE_URL || '/';
const hangmanHeroUrl = withBasePath('/vc-activities/hangman-hero.svg', appBase);

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
] as const;

const phraseDraft = ref('');
const commitError = ref('');
const statusLine = ref('');

const uid = () => props.currentUserId?.trim() ?? '';

function displayNameFor(userId: string): string {
  const id = userId.trim();
  const row = props.voiceParticipants.find((p) => p.id === id);
  if (row?.name?.trim()) return row.name.trim();
  return id.slice(0, 8);
}

const rosterLabel = computed(() =>
  props.hangmanRosterUserIds.map((id) => displayNameFor(id)).join(' · '),
);

const act = computed(() => props.hangmanActivity);

const isSetter = computed(() => {
  const st = act.value;
  const me = uid();
  if (!st || !me) return false;
  return st.setterUserId === me;
});

const rosterSorted = computed(() =>
  [...props.hangmanRosterUserIds]
    .map((id) => id.trim())
    .filter(Boolean)
    .sort(),
);

/** Matches {@link hangmanOrchestratorUserId}: first id in the sorted roster Echo uses for sync. */
const rosterForHost = computed(() => {
  const fromAct = act.value?.rosterUserIds;
  if (fromAct?.length) return fromAct;
  return rosterSorted.value;
});

const isRoundHost = computed(() => {
  const r = rosterForHost.value;
  const me = uid();
  if (!r.length || !me) return false;
  return r[0] === me;
});

const roundHostName = computed(() => {
  const id = rosterForHost.value[0];
  return id ? displayNameFor(id) : '';
});

const maskSlots = computed(() => {
  const m = act.value?.mask;
  if (!m) return [] as string[];
  return m.split('');
});

const wrongCount = computed(() => act.value?.wrongCount ?? 0);

const strikesRemaining = computed(() =>
  Math.max(0, VC_HANGMAN_MAX_WRONG - wrongCount.value),
);

const guessed = computed(() => {
  const g = act.value?.guessedLetters ?? [];
  const o: Record<string, true> = {};
  for (const x of g) o[x] = true;
  return o;
});

const phase = computed(() => act.value?.phase ?? null);

const roundOutcome = computed(() => {
  const st = act.value;
  if (!st || st.phase !== 'round_over') return null;
  return st.roundResult;
});

watch(
  () => act.value,
  (st) => {
    if (!st) {
      statusLine.value =
        'Connecting to your voice session… Open Hangman while you are in voice so Echo can keep everyone in sync.';
      return;
    }
    if (st.phase === 'setter_picking') {
      statusLine.value =
        st.setterUserId === uid()
          ? 'You are the puzzle master this round. Type a secret phrase — only you will see it until the round ends.'
          : `${displayNameFor(st.setterUserId)} is choosing a secret phrase. Hang tight!`;
    } else if (st.phase === 'guessing') {
      if (st.setterUserId === uid()) {
        statusLine.value =
          'You know the answer. Watch the letters come in — your Echo client checks each guess and updates the puzzle for the room.';
      } else {
        statusLine.value =
          'Guess one letter at a time (keyboard or buttons). Wrong guesses add to the picture — you have six before the round ends.';
      }
    } else if (st.phase === 'round_over') {
      if (st.roundResult === 'won') {
        statusLine.value = 'Nice work — the crew cracked the phrase!';
      } else {
        statusLine.value =
          'Out of guesses this time. The answer is shown below; there is no penalty, just vibes.';
      }
    }
  },
  { immediate: true, deep: true },
);

function onSubmitPhrase() {
  commitError.value = '';
  const err = props.commitWord(phraseDraft.value);
  if (err) {
    commitError.value = err;
    return;
  }
  phraseDraft.value = '';
}

function tryLetter(ch: string) {
  if (phase.value !== 'guessing') return;
  if (isSetter.value) return;
  const c = ch.toUpperCase();
  if (!/^[A-Z]$/.test(c)) return;
  if (guessed.value[c]) return;
  props.guessLetter(c);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k.length === 1 && /^[a-zA-Z]$/.test(k)) {
    if (phase.value !== 'guessing' || isSetter.value) return;
    e.preventDefault();
    tryLetter(k);
  }
}

function keyButtonClass(ch: string): string {
  const c = ch.toUpperCase();
  if (!guessed.value[c]) return '';
  const m = act.value?.mask ?? '';
  if (m.includes(c)) return 'vc-hangman-key--hit';
  return 'vc-hangman-key--miss';
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
});

const hangmanSvgParts = computed(() => wrongCount.value);
</script>

<template>
  <div
    class="vc-hangman flex min-h-0 min-w-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-2 py-4 sm:px-5 sm:py-5"
    role="application"
    aria-label="Echo voice Hangman"
  >
    <!-- Branded hero -->
    <header
      class="vc-hangman__hero relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border shadow-lg"
    >
      <div
        class="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_0%_0%,color-mix(in_srgb,var(--vc-hm-a1)_34%,transparent)_0%,transparent_55%),radial-gradient(100%_90%_at_100%_100%,color-mix(in_srgb,var(--vc-hm-a2)_30%,transparent)_0%,transparent_50%),linear-gradient(165deg,color-mix(in_srgb,var(--elevated)_92%,#0c0610)_0%,color-mix(in_srgb,var(--elevated)_98%,var(--bg))_100%)]"
        aria-hidden="true"
      />
      <img
        class="vc-hangman__hero-art pointer-events-none absolute -right-4 bottom-0 h-[min(9.5rem,42vw)] w-auto max-w-[55%] object-contain opacity-95 sm:right-2 sm:h-[10.5rem]"
        :src="hangmanHeroUrl"
        width="480"
        height="200"
        alt=""
      />
      <div
        class="relative z-[1] flex flex-col gap-1 px-4 py-4 pr-[min(46%,12rem)] sm:px-6 sm:py-5"
      >
        <p
          class="text-[10px] font-bold uppercase tracking-[0.22em] text-fg-subtle sm:text-[11px]"
        >
          Echo · Voice channel
        </p>
        <h1 class="text-xl font-bold tracking-tight text-fg sm:text-2xl">
          Hangman
        </h1>
        <p
          class="max-w-md text-pretty text-[13px] leading-snug text-fg-soft sm:text-sm"
        >
          A relaxed word game for people in voice together. Phrases and guesses
          stay synced over Echo while someone trustworthy holds the answer each
          round.
        </p>
      </div>
    </header>

    <details
      class="vc-hangman__rules group w-full max-w-2xl rounded-xl border border-border bg-elevated/75 px-3 py-2 sm:px-4"
    >
      <summary
        class="cursor-pointer list-none text-left text-[12px] font-semibold text-fg outline-none marker:content-none [&::-webkit-details-marker]:hidden sm:text-sm"
      >
        <span class="text-fg-soft group-open:text-fg">How turns work</span>
        <span class="ml-1.5 text-fg-subtle font-normal">· tap to expand</span>
      </summary>
      <ul
        class="mt-2 space-y-1.5 border-t border-border/80 pt-2 text-[11px] leading-relaxed text-fg-soft sm:text-xs"
      >
        <li>
          <strong class="text-fg-soft">Who is playing:</strong> everyone with
          this Hangman panel open in the same voice channel appears in the
          player strip below (Echo uses presence, not the whole server).
        </li>
        <li>
          <strong class="text-fg-soft">Choosing the secret:</strong> turns go
          round-robin. When it is your turn, pick letters A–Z and spaces between
          words (up to six words).
        </li>
        <li>
          <strong class="text-fg-soft">Guessing:</strong> each letter is sent
          over the voice data channel; the puzzle master’s Echo client applies
          it so everyone sees the same board.
        </li>
        <li>
          <strong class="text-fg-soft">Next round:</strong> when a round ends,
          tap <strong class="text-fg">Play next round</strong>. Echo picks one
          “round host” (first player in the sorted list) so the next picker
          state stays consistent for the room.
        </li>
      </ul>
    </details>

    <div
      class="flex w-full max-w-2xl flex-col items-stretch gap-2 rounded-xl border border-border/90 bg-elevated/40 px-3 py-2.5 sm:flex-row sm:items-center sm:px-4"
    >
      <p
        class="min-w-0 flex-1 text-pretty text-center text-[13px] leading-snug text-fg sm:text-left sm:text-sm"
      >
        {{ statusLine }}
      </p>
      <div
        v-if="phase === 'guessing' || phase === 'round_over'"
        class="flex shrink-0 items-center justify-center gap-1 self-center sm:self-auto"
        aria-hidden="true"
      >
        <span
          v-for="i in VC_HANGMAN_MAX_WRONG"
          :key="'strike-' + i"
          class="vc-hangman__strike-dot"
          :class="{
            'vc-hangman__strike-dot--spent': i <= wrongCount,
            'vc-hangman__strike-dot--last':
              i === wrongCount && phase === 'guessing',
          }"
        />
      </div>
    </div>

    <div
      v-if="hangmanRosterUserIds.length"
      class="w-full max-w-2xl rounded-lg border border-dashed border-border/80 bg-surface/40 px-3 py-2 text-center text-[11px] text-fg-subtle sm:text-xs"
    >
      <span class="font-semibold text-fg-soft">Playing this round · </span
      >{{ rosterLabel }}
    </div>

    <div
      v-if="!act"
      class="w-full max-w-md rounded-xl border border-border bg-elevated px-4 py-3 text-center text-sm text-fg-soft"
    >
      Waiting for game data from voice. Join a voice channel and open Hangman
      here so Echo can attach you to the activity.
    </div>

    <template v-else>
      <!-- Round banners -->
      <div
        v-if="roundOutcome === 'won'"
        class="flex w-full max-w-2xl items-center justify-center gap-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-center"
        role="status"
      >
        <svg
          class="h-8 w-8 shrink-0 text-emerald-300/90"
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="16"
            cy="16"
            r="14"
            stroke="currentColor"
            stroke-width="1.5"
            opacity="0.35"
          />
          <path
            d="M9 17l5 5 9-11"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <p class="text-sm font-semibold text-emerald-200/95 sm:text-base">
          Round won — phrase solved!
        </p>
      </div>
      <div
        v-else-if="roundOutcome === 'lost'"
        class="flex w-full max-w-2xl flex-col items-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-center"
        role="status"
      >
        <p class="text-sm font-semibold text-fg sm:text-base">Round complete</p>
        <p class="text-[12px] text-fg-soft sm:text-[13px]">
          Six misses — the phrase was tougher this time. Compare answers below
          and jump back in with
          <strong class="text-fg">Play next round</strong>.
        </p>
      </div>

      <div
        v-if="act.phase === 'setter_picking' && isSetter"
        class="vc-hangman__setter-card flex w-full max-w-md flex-col gap-3 rounded-2xl border border-border bg-elevated p-4 shadow-md"
      >
        <div>
          <label
            class="text-xs font-semibold uppercase tracking-wide text-fg-subtle"
            for="vc-hangman-phrase"
            >Your secret phrase</label
          >
          <p class="mt-1 text-[12px] text-fg-soft">
            Others will see blanks and spaces only. Avoid names or passwords you
            would not say out loud in voice.
          </p>
        </div>
        <textarea
          id="vc-hangman-phrase"
          v-model="phraseDraft"
          rows="3"
          maxlength="48"
          class="chat-focus-ring min-h-[3.25rem] w-full resize-y rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle"
          placeholder="For example: ECHO PARTY LINE"
          autocomplete="off"
          autocapitalize="characters"
        />
        <p v-if="commitError" class="text-xs font-medium text-red-500">
          {{ commitError }}
        </p>
        <button
          type="button"
          class="chat-focus-ring rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg shadow-sm transition hover:opacity-95 active:scale-[0.99]"
          @click="onSubmitPhrase"
        >
          Lock phrase &amp; let everyone guess
        </button>
      </div>

      <div
        v-if="act.phase === 'setter_picking' && !isSetter"
        class="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-border bg-elevated/60 px-4 py-8 text-center"
      >
        <div
          class="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface text-accent"
          aria-hidden="true"
        >
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3v3M12 18v3M3 12h3M18 12h3"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              opacity="0.45"
            />
            <circle
              cx="12"
              cy="12"
              r="3.5"
              stroke="currentColor"
              stroke-width="1.8"
            />
          </svg>
        </div>
        <p class="text-sm font-medium text-fg">Waiting on the secret phrase</p>
        <p class="text-[12px] text-fg-soft">
          {{ displayNameFor(act.setterUserId) }} is typing something for the
          group. You will see the blank puzzle as soon as they lock it in.
        </p>
      </div>

      <div
        v-if="act.phase === 'guessing' || act.phase === 'round_over'"
        class="flex w-full max-w-2xl flex-col items-stretch gap-4 lg:flex-row lg:items-start lg:justify-center"
      >
        <div
          class="vc-hangman__stage flex shrink-0 items-center justify-center rounded-2xl border border-border bg-[linear-gradient(180deg,color-mix(in_srgb,var(--elevated)_95%,#08060a)_0%,color-mix(in_srgb,var(--surface)_88%,#0a0812)_100%)] p-3 shadow-inner sm:p-4"
          aria-hidden="true"
        >
          <svg
            class="vc-hangman__svg h-auto w-full max-w-[11rem] sm:max-w-[13rem]"
            viewBox="0 0 160 176"
            width="208"
            height="228"
          >
            <defs>
              <linearGradient id="vcHmWood" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#5c4333" />
                <stop offset="100%" stop-color="#2a1f18" />
              </linearGradient>
              <linearGradient id="vcHmRope" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#d6d3d1" />
                <stop offset="100%" stop-color="#78716c" />
              </linearGradient>
            </defs>
            <!-- Ground shadow -->
            <ellipse
              cx="82"
              cy="168"
              rx="56"
              ry="5"
              fill="currentColor"
              class="text-fg opacity-[0.07]"
            />
            <!-- Gallows -->
            <g
              fill="none"
              stroke="url(#vcHmWood)"
              stroke-linecap="round"
              stroke-width="4"
            >
              <line x1="14" y1="164" x2="132" y2="164" />
              <line x1="36" y1="164" x2="36" y2="22" />
              <line x1="36" y1="22" x2="118" y2="22" />
              <line x1="118" y1="22" x2="118" y2="40" />
            </g>
            <path
              d="M118 40 Q118 48 114 52"
              fill="none"
              stroke="url(#vcHmRope)"
              stroke-width="2.2"
              stroke-linecap="round"
            />
            <!-- Figure (wrong guesses) -->
            <g
              v-if="hangmanSvgParts >= 1"
              fill="none"
              stroke-width="2.8"
              stroke-linecap="round"
              class="vc-hangman__figure"
            >
              <circle cx="114" cy="60" r="11" />
            </g>
            <g
              v-if="hangmanSvgParts >= 2"
              fill="none"
              stroke-width="2.8"
              stroke-linecap="round"
              class="vc-hangman__figure"
            >
              <line x1="114" y1="71" x2="114" y2="118" />
            </g>
            <g
              v-if="hangmanSvgParts >= 3"
              fill="none"
              stroke-width="2.8"
              stroke-linecap="round"
              class="vc-hangman__figure"
            >
              <line x1="114" y1="82" x2="86" y2="100" />
            </g>
            <g
              v-if="hangmanSvgParts >= 4"
              fill="none"
              stroke-width="2.8"
              stroke-linecap="round"
              class="vc-hangman__figure"
            >
              <line x1="114" y1="82" x2="142" y2="100" />
            </g>
            <g
              v-if="hangmanSvgParts >= 5"
              fill="none"
              stroke-width="2.8"
              stroke-linecap="round"
              class="vc-hangman__figure"
            >
              <line x1="114" y1="118" x2="92" y2="152" />
            </g>
            <g
              v-if="hangmanSvgParts >= 6"
              fill="none"
              stroke-width="2.8"
              stroke-linecap="round"
              class="vc-hangman__figure"
            >
              <line x1="114" y1="118" x2="136" y2="152" />
            </g>
          </svg>
        </div>

        <div class="flex min-w-0 flex-1 flex-col items-center gap-3 lg:pt-1">
          <div
            class="flex w-full flex-wrap items-end justify-center gap-x-1 gap-y-2 font-mono sm:gap-x-1.5"
            aria-live="polite"
            aria-atomic="true"
          >
            <template v-for="(slot, i) in maskSlots" :key="'hm-' + i">
              <span v-if="slot === ' '" class="w-3 shrink-0 sm:w-4" />
              <span
                v-else-if="slot === '_'"
                class="vc-hangman-tile vc-hangman-tile--blank"
              />
              <span v-else class="vc-hangman-tile vc-hangman-tile--letter">{{
                slot
              }}</span>
            </template>
          </div>

          <p
            v-if="act.phase === 'guessing'"
            class="text-[12px] tabular-nums text-fg-soft sm:text-sm"
          >
            <span class="text-fg-subtle">Strikes</span>
            {{ wrongCount }} / {{ VC_HANGMAN_MAX_WRONG }}
            <span class="text-fg-subtle"> · </span>
            <span class="text-fg-subtle">{{ strikesRemaining }} left</span>
          </p>

          <div
            v-if="act.phase === 'round_over' && act.roundResult === 'lost'"
            class="w-full max-w-lg rounded-xl border border-border bg-surface/80 px-3 py-2 text-center"
          >
            <p
              class="text-[11px] font-medium uppercase tracking-wide text-fg-subtle"
            >
              The phrase was
            </p>
            <p
              class="mt-1 font-mono text-base font-semibold tracking-[0.18em] text-fg sm:text-lg"
            >
              {{ act.answerReveal ?? '—' }}
            </p>
          </div>
        </div>
      </div>

      <div
        v-if="act.phase === 'guessing' && !isSetter"
        class="flex w-full max-w-xl flex-col items-stretch gap-2"
      >
        <p class="text-center text-[11px] text-fg-subtle sm:text-xs">
          Press letter keys on your keyboard, or tap the board below.
        </p>
        <div
          v-for="(row, ri) in KEYBOARD_ROWS"
          :key="'hk-' + ri"
          class="flex flex-wrap justify-center gap-1.5 sm:gap-2"
        >
          <button
            v-for="k in row"
            :key="k"
            type="button"
            class="vc-hangman-key chat-focus-ring min-h-[2.25rem] min-w-[1.75rem] rounded-lg px-1.5 py-1 text-xs font-bold uppercase sm:min-w-[2rem] sm:text-[13px]"
            :class="keyButtonClass(k)"
            :disabled="!!guessed[k]"
            @click="tryLetter(k)"
          >
            {{ k }}
          </button>
        </div>
      </div>

      <div
        v-if="act.phase === 'round_over'"
        class="flex w-full max-w-md flex-col items-center gap-2"
      >
        <button
          type="button"
          class="chat-focus-ring w-full max-w-xs rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg shadow-sm transition hover:opacity-95 active:scale-[0.99] sm:w-auto sm:min-w-[12rem]"
          @click="nextRound"
        >
          Play next round
        </button>
        <p
          v-if="roundHostName"
          class="max-w-sm text-center text-[11px] leading-relaxed text-fg-subtle sm:text-xs"
        >
          <template v-if="isRoundHost">
            You are this round’s host in Echo — your client applies the next
            picker when everyone taps the button above.
          </template>
          <template v-else>
            Anyone can tap the button; Echo routes the update through
            <strong class="font-medium text-fg-soft">{{
              roundHostName
            }}</strong>
            so the next turn stays in sync.
          </template>
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.vc-hangman {
  --vc-hm-a1: #f59e0b;
  --vc-hm-a2: #7c3aed;
  --vc-hm-figure: #fbbf24;
}

.vc-hangman__hero {
  --vc-hm-a1: #f59e0b;
  --vc-hm-a2: #7c3aed;
}

.vc-hangman__hero-art {
  mask-image: linear-gradient(90deg, transparent 0%, black 18%, black 100%);
}

.vc-hangman__strike-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--fg) 22%, var(--elevated));
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  transition:
    background 0.15s ease,
    transform 0.15s ease;
}

.vc-hangman__strike-dot--spent {
  background: color-mix(in srgb, #f97316 55%, var(--elevated));
  border-color: color-mix(in srgb, #fb923c 45%, var(--border));
}

.vc-hangman__strike-dot--last {
  transform: scale(1.15);
  box-shadow: 0 0 0 2px color-mix(in srgb, #f59e0b 35%, transparent);
}

.vc-hangman__figure {
  stroke: color-mix(in srgb, var(--vc-hm-figure) 88%, var(--fg));
}

.vc-hangman__svg {
  color: var(--fg);
  opacity: 0.94;
}

.vc-hangman-tile {
  display: inline-flex;
  min-width: 1.65rem;
  height: 2.35rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.45rem;
  font-size: clamp(1.05rem, 3.2vw, 1.45rem);
  font-weight: 700;
  letter-spacing: 0.06em;
}

.vc-hangman-tile--letter {
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  background: color-mix(in srgb, var(--elevated) 88%, var(--fg) 4%);
  color: var(--fg);
  box-shadow: 0 1px 0 color-mix(in srgb, white 6%, transparent) inset;
}

.vc-hangman-tile--blank {
  border-bottom: 3px solid color-mix(in srgb, var(--fg) 28%, transparent);
  border-radius: 0.15rem;
  min-width: 1.35rem;
  height: 2.1rem;
  opacity: 0.85;
}

.vc-hangman-key {
  border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
  background: color-mix(in srgb, var(--elevated) 92%, var(--fg) 4%);
  color: var(--fg);
  box-shadow:
    0 1px 0 color-mix(in srgb, white 5%, transparent) inset,
    0 2px 6px color-mix(in srgb, black 12%, transparent);
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    opacity 0.12s ease,
    transform 0.08s ease;
}

.vc-hangman-key:hover:not(:disabled) {
  background: var(--glass-hover);
  transform: translateY(-1px);
}

.vc-hangman-key:active:not(:disabled) {
  transform: translateY(0);
}

.vc-hangman-key:disabled {
  opacity: 0.52;
  cursor: default;
  box-shadow: none;
}

.vc-hangman-key--hit {
  border-color: color-mix(in srgb, #16a34a 55%, var(--border));
  background: color-mix(in srgb, #16a34a 22%, var(--elevated));
}

.vc-hangman-key--miss {
  border-color: color-mix(in srgb, #dc2626 45%, var(--border));
  background: color-mix(in srgb, #dc2626 18%, var(--elevated));
}

[data-theme='light'] .vc-hangman-key--hit {
  background: color-mix(in srgb, #22c55e 28%, var(--surface));
}

[data-theme='light'] .vc-hangman-key--miss {
  background: color-mix(in srgb, #ef4444 22%, var(--surface));
}
</style>
