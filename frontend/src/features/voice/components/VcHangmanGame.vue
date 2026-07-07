<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { EchoHangmanActivityV1 } from '@/audio/voiceEchoLiveKitData';
import HangmanHeader from '@/features/voice/hangman/components/HangmanHeader.vue';
import HangmanKeyboard from '@/features/voice/hangman/components/HangmanKeyboard.vue';
import HangmanPuzzle from '@/features/voice/hangman/components/HangmanPuzzle.vue';
import HangmanScene from '@/features/voice/hangman/components/HangmanScene.vue';
import HangmanSetterPanel from '@/features/voice/hangman/components/HangmanSetterPanel.vue';
import HangmanSidebar from '@/features/voice/hangman/components/HangmanSidebar.vue';
import type {
  GuessLogRow,
  HitScoreRow,
  PuzzleWord,
} from '@/features/voice/hangman/hangmanTypes';
import {
  VC_HANGMAN_MAX_LEN,
  VC_HANGMAN_MAX_WORDS,
  VC_HANGMAN_MAX_WRONG,
  hangmanOrchestratorUserId,
  mergeHangmanPresenceRoster,
} from '@/features/voice/vcHangmanReducer';
import { withBasePath } from '@/features/layout/urlNavigation';
import {
  useVoiceGameSfx,
  type VoiceGameSfxSpec,
} from '@/features/voice/composables/useVoiceGameSfx';

const PENDING_GUESS_MS = 12_000;

const props = defineProps<{
  currentUserId?: string;
  hangmanActivity: EchoHangmanActivityV1 | null;
  hangmanRosterUserIds: string[];
  voiceParticipants: readonly { id: string; name: string; pfp?: string }[];
  voiceChannelId?: string;
  gameRoomConnected?: boolean;
  gameRoomError?: string | null;
  commitWord: (raw: string) => string | null;
  guessLetter: (letter: string) => void;
  nextRound: () => void;
}>();

const appBase = import.meta.env.BASE_URL || '/';
const hangmanHeroUrl = withBasePath('/vc-activities/hangman-hero.svg', appBase);

type HangmanSfxKind = 'lock' | 'hit' | 'miss' | 'won' | 'lost';

const HANGMAN_SFX: Record<HangmanSfxKind, VoiceGameSfxSpec> = {
  lock: { frequencies: [440, 660], duration: 0.09, gain: 0.028 },
  hit: { frequencies: [660, 880], duration: 0.1, gain: 0.026 },
  miss: { frequencies: [300, 240], duration: 0.12, gain: 0.022 },
  won: { frequencies: [523, 659, 784], duration: 0.15, gain: 0.025 },
  lost: { frequencies: [330, 277], duration: 0.16, gain: 0.018 },
};

let pendingGuessTimer: ReturnType<typeof setTimeout> | null = null;

function clearPendingGuessTimer(): void {
  if (pendingGuessTimer != null) {
    clearTimeout(pendingGuessTimer);
    pendingGuessTimer = null;
  }
}

const phraseDraft = ref('');
const commitError = ref('');
const statusLine = ref('');
const pendingLocalGuess = ref<string | null>(null);
const guessSyncStalled = ref(false);
const lastRoundResultSfxKey = ref<string | null>(null);

const uid = () => props.currentUserId?.trim() ?? '';

function displayNameFor(userId: string): string {
  const id = userId.trim();
  const row = props.voiceParticipants.find((p) => p.id === id);
  if (row?.name?.trim()) return row.name.trim();
  return id.slice(0, 8);
}

function pfpUrlFor(userId: string): string {
  const id = userId.trim();
  if (!id) return '';
  const raw = props.voiceParticipants.find((p) => p.id === id)?.pfp?.trim();
  return raw ?? '';
}

const rosterLabel = computed(() =>
  props.hangmanRosterUserIds.map((id) => displayNameFor(id)).join(' · '),
);

const act = computed(() => props.hangmanActivity);

const emptyTitle = computed(() => {
  if (!props.voiceChannelId?.trim()) return 'Join voice to play';
  if (props.gameRoomError === 'not_configured') return 'Games unavailable';
  if (props.gameRoomError) return 'Could not connect to game';
  if (!props.gameRoomConnected) return 'Connecting to game…';
  return 'Starting round…';
});

const emptyBody = computed(() => {
  if (!props.voiceChannelId?.trim()) {
    return 'Join a voice channel and open Hangman so Echo can sync everyone to the same round.';
  }
  if (props.gameRoomError === 'not_configured') {
    return 'The game server is not configured on this Echo instance. Ask an admin to set GAME_SERVER_PUBLIC_URL and run echo-game-server.';
  }
  if (props.gameRoomError) {
    return 'Echo could not reach the game server. Check that echo-game-server is running and reachable from your browser.';
  }
  if (!props.gameRoomConnected) {
    return 'Hangman is syncing with the voice room. This usually takes a moment after you join voice.';
  }
  return 'Hangman is loading the current round from the game server.';
});

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

const mergedHangmanRoster = computed(() =>
  mergeHangmanPresenceRoster(
    act.value?.rosterUserIds ?? [],
    props.hangmanRosterUserIds,
  ),
);

const orchForNextRound = computed(
  () => hangmanOrchestratorUserId(mergedHangmanRoster.value) ?? '',
);

const roundOrchestratorDisplayName = computed(() => {
  const id = orchForNextRound.value;
  return id ? displayNameFor(id) : '';
});

/** Matches server: roster host advances locally; if they left Hangman, setter can. */
const canSelfAdvanceHangmanRound = computed(() => {
  const me = uid();
  if (!me || !act.value || act.value.phase !== 'round_over') return false;
  const orch = orchForNextRound.value;
  if (!orch) return false;
  const orchInPresence = props.hangmanRosterUserIds.includes(orch);
  const setter = act.value.setterUserId.trim();
  if (orchInPresence && me === orch) return true;
  if (!orchInPresence && me === setter) return true;
  return false;
});

const isRoundHost = computed(() => {
  const me = uid();
  const orch = orchForNextRound.value;
  return !!(me && orch && me === orch);
});

const puzzleWords = computed<PuzzleWord[]>(() => {
  const m = act.value?.mask;
  if (!m) return [];
  return m.split(' ').map((word, index) => ({
    id: `word-${index}-${word.length}`,
    slots: word.split(''),
  }));
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

const guessedLetters = computed(() => act.value?.guessedLetters ?? []);

const hitLetters = computed(() => {
  const m = act.value?.mask ?? '';
  return guessedLetters.value.filter((letter) => m.includes(letter));
});

const missedLetters = computed(() => {
  const m = act.value?.mask ?? '';
  return guessedLetters.value.filter((letter) => !m.includes(letter));
});

const guessLogEntries = computed((): GuessLogRow[] => {
  const st = act.value;
  if (!st || (st.phase !== 'guessing' && st.phase !== 'round_over')) return [];
  const mask = st.mask ?? '';
  const letters = st.guessedLetters ?? [];
  const hist = st.guessHistory ?? [];
  const out: GuessLogRow[] = [];
  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i]!;
    const entry = hist[i];
    const histLetter = entry?.letter?.trim().toUpperCase() ?? '';
    const L =
      /^[A-Z]$/.test(histLetter) && histLetter === letter ? histLetter : letter;
    const userId = (entry?.userId ?? '').trim();
    out.push({
      userId,
      displayName: userId ? displayNameFor(userId) : 'Someone',
      letter: L,
      hit: mask.includes(L),
    });
  }
  return out;
});

/** Per-round: count correct letter guesses by roster user (from synced history). */
const hitScoreboard = computed((): HitScoreRow[] => {
  const counts = new Map<string, number>();
  for (const row of guessLogEntries.value) {
    if (!row.hit) continue;
    const id = row.userId.trim();
    const key = id || '_unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: HitScoreRow[] = [];
  for (const [key, correctCount] of counts) {
    const userId = key === '_unknown' ? '' : key;
    out.push({
      userId,
      displayName: userId ? displayNameFor(userId) : 'Unknown',
      pfpUrl: pfpUrlFor(userId),
      correctCount,
    });
  }
  out.sort(
    (a, b) =>
      b.correctCount - a.correctCount ||
      a.displayName.localeCompare(b.displayName),
  );
  return out;
});

const topHitScorer = computed(() => hitScoreboard.value[0] ?? null);

const topHitIsTied = computed(() => {
  const rows = hitScoreboard.value;
  if (rows.length < 2) return false;
  const top = rows[0]!.correctCount;
  return rows[1]!.correctCount === top;
});

/** Comma-separated names of everyone tied for the top hit count. */
const topHitTiedNames = computed(() => {
  const rows = hitScoreboard.value;
  if (!rows.length) return '';
  const top = rows[0]!.correctCount;
  return rows
    .filter((r) => r.correctCount === top)
    .map((r) => r.displayName)
    .join(', ');
});

const lastGuess = computed(() => {
  const letters = guessedLetters.value;
  return letters.length ? letters[letters.length - 1] : null;
});

const lastGuessWasHit = computed(() => {
  const last = lastGuess.value;
  if (!last) return null;
  return (act.value?.mask ?? '').includes(last);
});

const lastGuessDisplayName = computed(() => {
  const rows = guessLogEntries.value;
  if (!rows.length) return 'Someone';
  return rows[rows.length - 1]!.displayName;
});

const phraseHelp = computed(() => {
  const normalized = phraseDraft.value.trim().replace(/\s+/g, ' ');
  const words = normalized ? normalized.split(' ').length : 0;
  return `${normalized.length}/${VC_HANGMAN_MAX_LEN} chars · ${words}/${VC_HANGMAN_MAX_WORDS} words`;
});

const phase = computed(() => act.value?.phase ?? null);

const canTypeGuess = computed(
  () => phase.value === 'guessing' && !isSetter.value,
);

const roundOutcome = computed(() => {
  const st = act.value;
  if (!st || st.phase !== 'round_over') return null;
  return st.roundResult;
});

const { play: playHangmanSfx } = useVoiceGameSfx(HANGMAN_SFX, {
  throttleMs: 70,
  rampMs: 12,
  staggerMs: 45,
});

watch(
  () => act.value,
  (st) => {
    if (!st) {
      if (!props.voiceChannelId?.trim()) {
        statusLine.value =
          'Waiting for the voice room. Join voice and open Hangman here so everyone sees the same game.';
      } else if (props.gameRoomError) {
        statusLine.value = 'Could not reach the game server.';
      } else if (!props.gameRoomConnected) {
        statusLine.value =
          'Hangman is syncing with the game server. This usually takes a moment after you join voice.';
      } else {
        statusLine.value = 'Starting round…';
      }
      return;
    }
    if (st.phase === 'setter_picking') {
      statusLine.value =
        st.setterUserId === uid()
          ? 'Your turn — type a secret phrase and lock it in.'
          : `${displayNameFor(st.setterUserId)} is crafting the secret phrase…`;
    } else if (st.phase === 'guessing') {
      if (st.setterUserId === uid()) {
        statusLine.value =
          'You made the puzzle — guesses sync through the roster host if your link drops.';
      } else {
        statusLine.value =
          'Tap a key, or click the letter box below and type A–Z on your keyboard.';
      }
    } else if (st.phase === 'round_over') {
      if (st.roundResult === 'won') {
        statusLine.value = 'The crew cracked it!';
      } else {
        statusLine.value = 'Six misses — the phrase is revealed below.';
      }
    }
  },
  { immediate: true, deep: true },
);

watch(guessedLetters, (letters) => {
  const pending = pendingLocalGuess.value;
  if (!pending || !letters.includes(pending)) return;
  pendingLocalGuess.value = null;
  guessSyncStalled.value = false;
  clearPendingGuessTimer();
  const hit = (act.value?.mask ?? '').includes(pending);
  playHangmanSfx(hit ? 'hit' : 'miss');
});

watch(
  () => {
    const st = act.value;
    if (!st) return null;
    return `${st.roundSeq}:${st.phase}`;
  },
  () => {
    pendingLocalGuess.value = null;
    guessSyncStalled.value = false;
    clearPendingGuessTimer();
  },
);

watch(roundOutcome, (outcome) => {
  const st = act.value;
  if (!st || st.phase !== 'round_over' || !outcome) return;
  const key = `${st.roundSeq}:${outcome}`;
  if (lastRoundResultSfxKey.value === key) return;
  lastRoundResultSfxKey.value = key;
  playHangmanSfx(outcome);
});

function onSubmitPhrase() {
  commitError.value = '';
  const err = props.commitWord(phraseDraft.value);
  if (err) {
    commitError.value = err;
    return;
  }
  phraseDraft.value = '';
  playHangmanSfx('lock');
}

function tryLetter(ch: string) {
  if (phase.value !== 'guessing') return;
  if (isSetter.value) return;
  const c = ch.toUpperCase();
  if (!/^[A-Z]$/.test(c)) return;
  if (guessed.value[c]) return;
  pendingLocalGuess.value = c;
  guessSyncStalled.value = false;
  clearPendingGuessTimer();
  pendingGuessTimer = setTimeout(() => {
    pendingGuessTimer = null;
    if (pendingLocalGuess.value === c) {
      pendingLocalGuess.value = null;
      guessSyncStalled.value = true;
    }
  }, PENDING_GUESS_MS);
  props.guessLetter(c);
}

onUnmounted(() => {
  clearPendingGuessTimer();
});
</script>

<template>
  <div class="hm-game" role="application" aria-label="Echo voice Hangman">
    <!-- ─── Header ───────────────────────────────────────────── -->
    <HangmanHeader
      :roster-label="rosterLabel"
      :player-count="hangmanRosterUserIds.length"
    />

    <!-- ─── Status HUD ──────────────────────────────────────── -->
    <div
      class="hm-hud"
      :class="{
        'hm-hud--danger': wrongCount >= 4 && phase === 'guessing',
        'hm-hud--won': roundOutcome === 'won',
        'hm-hud--lost': roundOutcome === 'lost',
      }"
    >
      <p class="hm-hud__msg">{{ statusLine }}</p>
      <div
        v-if="phase === 'guessing' || phase === 'round_over'"
        class="hm-lives"
        :aria-label="`${strikesRemaining} of ${VC_HANGMAN_MAX_WRONG} lives remaining`"
      >
        <span
          v-for="i in VC_HANGMAN_MAX_WRONG"
          :key="'life-' + i"
          class="hm-lives__pip"
          :class="{
            'hm-lives__pip--gone': i <= wrongCount,
            'hm-lives__pip--last': i === wrongCount && phase === 'guessing',
          }"
          aria-hidden="true"
        />
      </div>
    </div>

    <!-- ─── No game data ─────────────────────────────────────── -->
    <div v-if="!act" class="hm-empty">
      <svg
        class="hm-empty__icon"
        viewBox="0 0 56 56"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="28"
          cy="28"
          r="26"
          stroke="currentColor"
          stroke-width="2"
          opacity="0.18"
        />
        <line
          x1="14"
          y1="14"
          x2="42"
          y2="14"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
        />
        <line
          x1="28"
          y1="14"
          x2="28"
          y2="23"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
        />
        <circle
          cx="28"
          cy="30"
          r="6"
          stroke="currentColor"
          stroke-width="2.5"
        />
        <line
          x1="28"
          y1="36"
          x2="28"
          y2="44"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
        />
        <line
          x1="21"
          y1="40"
          x2="28"
          y2="43"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
        />
        <line
          x1="35"
          y1="40"
          x2="28"
          y2="43"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
        />
      </svg>
      <p class="hm-empty__title">{{ emptyTitle }}</p>
      <p class="hm-empty__body">
        {{ emptyBody }}
      </p>
    </div>

    <template v-else>
      <!-- ─── Round result banners ──────────────────────────── -->
      <div
        v-if="roundOutcome === 'won'"
        class="hm-banner hm-banner--won"
        role="status"
      >
        <svg
          class="hm-banner__icon"
          viewBox="0 0 44 44"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="22"
            cy="22"
            r="20"
            stroke="currentColor"
            stroke-width="2.2"
          />
          <path
            d="M12 23l8 8 12-14"
            stroke="currentColor"
            stroke-width="2.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <div>
          <p class="hm-banner__title">Solved!</p>
          <p class="hm-banner__sub">
            The crew cracked the phrase. Well played.
          </p>
        </div>
      </div>

      <div
        v-else-if="roundOutcome === 'lost'"
        class="hm-banner hm-banner--lost"
        role="status"
      >
        <svg
          class="hm-banner__icon"
          viewBox="0 0 44 44"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="22"
            cy="22"
            r="20"
            stroke="currentColor"
            stroke-width="2.2"
          />
          <path
            d="M15 15l14 14M29 15L15 29"
            stroke="currentColor"
            stroke-width="2.6"
            stroke-linecap="round"
          />
        </svg>
        <div>
          <p class="hm-banner__title">Round over</p>
          <p class="hm-banner__sub">
            Six misses — the phrase was too tough this time.
          </p>
        </div>
      </div>

      <!-- ─── Setter: phrase entry + waiting ─────────────────── -->
      <HangmanSetterPanel
        v-if="act.phase === 'setter_picking'"
        v-model:draft="phraseDraft"
        :is-setter="isSetter"
        :setter-name="displayNameFor(act.setterUserId)"
        :max-len="VC_HANGMAN_MAX_LEN"
        :phrase-help="phraseHelp"
        :commit-error="commitError"
        @submit="onSubmitPhrase"
      />

      <!-- ─── Main arena: scaffold + puzzle ─────────────────── -->
      <div
        v-if="act.phase === 'guessing' || act.phase === 'round_over'"
        class="hm-arena"
      >
        <div class="hm-arena__left">
          <!-- Gallows scene panel -->
          <HangmanScene
            :wrong-count="wrongCount"
            :round-over="act.phase === 'round_over'"
            :round-result="act.roundResult ?? null"
          />

          <HangmanSidebar
            :guess-log-entries="guessLogEntries"
            :hit-scoreboard="hitScoreboard"
            :top-hit-scorer="topHitScorer"
            :top-hit-is-tied="topHitIsTied"
            :top-hit-tied-names="topHitTiedNames"
          />
        </div>
        <!-- /hm-arena__left -->

        <!-- Puzzle panel -->
        <HangmanPuzzle
          :puzzle-words="puzzleWords"
          :phase="phase"
          :is-setter="isSetter"
          :last-guess="lastGuess"
          :round-result="act.roundResult ?? null"
          :answer-reveal="act.answerReveal ?? null"
          :hit-letters="hitLetters"
          :missed-letters="missedLetters"
          :last-guess-was-hit="lastGuessWasHit"
          :last-guess-display-name="lastGuessDisplayName"
        />
      </div>
      <!-- /hm-arena -->

      <!-- ─── Keyboard ──────────────────────────────────────── -->
      <HangmanKeyboard
        v-if="act.phase === 'guessing' && !isSetter"
        :can-type="canTypeGuess"
        :guessed-letters="guessedLetters"
        :mask="act.mask ?? ''"
        :last-guess="lastGuess"
        :sync-stalled="guessSyncStalled"
        @guess="tryLetter"
      />

      <!-- ─── Next round ────────────────────────────────────── -->
      <div v-if="act.phase === 'round_over'" class="hm-nextround">
        <button
          type="button"
          class="hm-btn hm-btn--next"
          :title="
            canSelfAdvanceHangmanRound
              ? 'Start the next round for everyone'
              : 'Ask the roster host to continue'
          "
          @click="nextRound"
        >
          <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path
              d="M9 2v4.5l3-3"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M5 5.5A7 7 0 1 0 9 2"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          Play next round
        </button>
        <p
          v-if="canSelfAdvanceHangmanRound || roundOrchestratorDisplayName"
          class="hm-nextround__note"
        >
          <template v-if="canSelfAdvanceHangmanRound">
            <template v-if="isRoundHost"
              >You're the roster host — your tap continues the game right
              away.</template
            >
            <template v-else
              >You're covering while the host is away — your tap continues the
              game.</template
            >
          </template>
          <template v-else>
            Tap to ping
            <strong>{{
              roundOrchestratorDisplayName || 'the roster host'
            }}</strong
            >. They can continue in one tap.
          </template>
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
/* ── Design tokens ──────────────────────────────────────────── */
.hm-game {
  --hm-bg: #06040f;
  --hm-surface: #0d0b1e;
  --hm-surface2: #110e26;
  --hm-border: rgba(255, 255, 255, 0.07);
  --hm-border-mid: rgba(255, 255, 255, 0.12);
  --hm-border-strong: rgba(255, 255, 255, 0.18);
  --hm-text: #ede8ff;
  --hm-text-soft: #9a93b8;
  --hm-text-muted: #4e4870;
  --hm-accent: #f59e0b;
  --hm-accent-dim: rgba(245, 158, 11, 0.14);
  --hm-hit: #10b981;
  --hm-hit-dim: rgba(16, 185, 129, 0.14);
  --hm-hit-glow: rgba(16, 185, 129, 0.28);
  --hm-miss: #f43f5e;
  --hm-miss-dim: rgba(244, 63, 94, 0.12);
  --hm-miss-glow: rgba(244, 63, 94, 0.26);
  --hm-figure: #e8d5a3;
  --hm-key-depth: #020109;
  --hm-radius: 12px;

  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  background:
    radial-gradient(
      ellipse 80% 45% at 50% 0%,
      rgba(245, 158, 11, 0.05) 0%,
      transparent 65%
    ),
    radial-gradient(
      ellipse 60% 55% at 5% 100%,
      rgba(124, 58, 237, 0.06) 0%,
      transparent 60%
    ),
    var(--hm-bg);
  color: var(--hm-text);
  font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  padding-bottom: max(0.35rem, env(safe-area-inset-bottom, 0px));
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
}

/* ── Status HUD ─────────────────────────────────────────────── */
.hm-hud {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid var(--hm-border);
  background: rgba(255, 255, 255, 0.015);
  flex-shrink: 0;
  transition: background 0.4s;
}

.hm-hud--danger {
  background: rgba(244, 63, 94, 0.04);
}

.hm-hud--won {
  background: rgba(16, 185, 129, 0.05);
}

.hm-hud--lost {
  background: rgba(244, 63, 94, 0.05);
}

.hm-hud__msg {
  flex: 1;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--hm-text-soft);
  min-width: 0;
}

.hm-lives {
  display: flex;
  align-items: center;
  gap: 0.28rem;
  flex-shrink: 0;
}

.hm-lives__pip {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition:
    background 0.2s,
    border-color 0.2s,
    transform 0.2s,
    box-shadow 0.2s;
}

.hm-lives__pip--gone {
  background: rgba(244, 63, 94, 0.45);
  border-color: rgba(244, 63, 94, 0.5);
}

.hm-lives__pip--last {
  transform: scale(1.2);
  box-shadow: 0 0 0 2px rgba(244, 63, 94, 0.3);
  animation: hm-pip-pulse 0.6s ease-out;
}

/* ── Empty state ─────────────────────────────────────────────── */
.hm-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2.5rem 1.5rem;
  text-align: center;
}

.hm-empty__icon {
  width: 3.5rem;
  height: 3.5rem;
  color: var(--hm-text-muted);
}

.hm-empty__title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--hm-text-soft);
}

.hm-empty__body {
  font-size: 0.82rem;
  color: var(--hm-text-muted);
  max-width: 22rem;
  line-height: 1.55;
}

/* ── Result banners ──────────────────────────────────────────── */
.hm-banner {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  margin: 0.75rem max(0.5rem, env(safe-area-inset-left, 0px)) 0
    max(0.5rem, env(safe-area-inset-right, 0px));
  padding: 0.85rem 1.1rem;
  border-radius: var(--hm-radius);
  border: 1px solid;
}

@media (max-width: 420px) {
  .hm-banner {
    flex-direction: column;
    text-align: center;
    align-items: center;
    gap: 0.65rem;
    padding: 0.85rem 0.85rem;
  }
}

.hm-banner__icon {
  width: 2.4rem;
  height: 2.4rem;
  flex-shrink: 0;
}

.hm-banner--won {
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.08);
  color: #6ee7b7;
}

.hm-banner--lost {
  border-color: rgba(244, 63, 94, 0.28);
  background: rgba(244, 63, 94, 0.07);
  color: #fca5a5;
}

.hm-banner__title {
  font-size: 0.95rem;
  font-weight: 700;
}

.hm-banner__sub {
  font-size: 0.78rem;
  opacity: 0.75;
  margin-top: 0.1rem;
}

/* ── Arena (scaffold + puzzle) ───────────────────────────────── */
.hm-arena {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  min-width: 0;
}

@media (min-width: 680px) {
  .hm-arena {
    flex-direction: row;
    align-items: flex-start;
  }
}

.hm-arena__left {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
  flex-shrink: 0;
  width: 100%;
}

@media (min-width: 680px) {
  .hm-arena__left {
    width: 13.5rem;
    max-width: 13.5rem;
  }
}

/* ── Buttons ─────────────────────────────────────────────────── */
.hm-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border-radius: 9px;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  border: none;
  transition:
    opacity 0.15s,
    transform 0.1s,
    box-shadow 0.15s;
  user-select: none;

  svg {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  &:active {
    transform: scale(0.98);
  }
}

.hm-btn--lock {
  padding: 0.55rem 1.1rem;
  background: var(--hm-accent);
  color: #18130a;
  box-shadow:
    0 3px 0 rgba(0, 0, 0, 0.4),
    0 0 18px rgba(245, 158, 11, 0.25);

  &:hover {
    opacity: 0.93;
  }
}

.hm-btn--next {
  padding: 0.75rem 2rem;
  background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
  color: white;
  font-size: 0.95rem;
  border-radius: 11px;
  box-shadow:
    0 4px 0 #2d1668,
    0 6px 20px rgba(124, 58, 237, 0.35);

  &:hover {
    opacity: 0.93;
    transform: translateY(-1px);
    box-shadow:
      0 5px 0 #2d1668,
      0 8px 24px rgba(124, 58, 237, 0.4);
  }

  &:active {
    transform: translateY(4px);
    box-shadow:
      0 0 0 #2d1668,
      0 2px 8px rgba(124, 58, 237, 0.3);
  }
}

/* ── Next round ──────────────────────────────────────────────── */
.hm-nextround {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
  padding: 1rem max(1rem, env(safe-area-inset-left, 0px)) 1.25rem
    max(1rem, env(safe-area-inset-right, 0px));
  border-top: 1px solid var(--hm-border);
  flex-shrink: 0;
}

@media (max-width: 420px) {
  .hm-nextround .hm-btn--next {
    width: 100%;
    max-width: 20rem;
    justify-content: center;
  }
}

.hm-nextround__note {
  font-size: 0.75rem;
  color: var(--hm-text-muted);
  text-align: center;
  max-width: 22rem;
  line-height: 1.5;

  strong {
    color: var(--hm-text-soft);
    font-weight: 600;
  }
}

/* ── Animations ──────────────────────────────────────────────── */
@keyframes hm-pip-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.5);
  }
  100% {
    box-shadow: 0 0 0 6px rgba(244, 63, 94, 0);
  }
}
/* ── Reduced motion ──────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .hm-lives__pip--last {
    animation: none;
  }
}

/* ── Light theme overrides ───────────────────────────────────── */
[data-theme='light'] .hm-game {
  --hm-bg: #f4f2fc;
  --hm-surface: #ffffff;
  --hm-surface2: #f8f7fe;
  --hm-border: rgba(0, 0, 0, 0.08);
  --hm-border-mid: rgba(0, 0, 0, 0.13);
  --hm-border-strong: rgba(0, 0, 0, 0.2);
  --hm-text: #1a1630;
  --hm-text-soft: #5a5278;
  --hm-text-muted: #9990b8;
  --hm-key-depth: #b8b4d0;
}
</style>
