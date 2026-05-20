<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { EchoHangmanActivityV1 } from '@/audio/voiceEchoLiveKitData';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import {
  VC_HANGMAN_MAX_LEN,
  VC_HANGMAN_MAX_WORDS,
  VC_HANGMAN_MAX_WRONG,
  hangmanOrchestratorUserId,
  mergeHangmanPresenceRoster,
} from '@/features/voice/vcHangmanReducer';
import { withBasePath } from '@/features/layout/urlNavigation';
import { useNotificationPreferencesStore } from '@/stores/notificationPreferences';
import { safeImageUrl } from '@/utils/safeImageUrl';

const PENDING_GUESS_MS = 12_000;

const props = defineProps<{
  currentUserId?: string;
  hangmanActivity: EchoHangmanActivityV1 | null;
  hangmanRosterUserIds: string[];
  voiceParticipants: readonly { id: string; name: string; pfp?: string }[];
  commitWord: (raw: string) => string | null;
  guessLetter: (letter: string) => void;
  nextRound: () => void;
}>();

const appBase = import.meta.env.BASE_URL || '/';
const hangmanHeroUrl = withBasePath('/vc-activities/hangman-hero.svg', appBase);
const notificationPreferences = useNotificationPreferencesStore();

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
] as const;

const BODY_PARTS = [
  'Head',
  'Body',
  'Left arm',
  'Right arm',
  'Left leg',
  'Right leg',
] as const;

type PuzzleWord = {
  id: string;
  slots: string[];
};

type GuessLogRow = {
  userId: string;
  displayName: string;
  letter: string;
  hit: boolean;
};

type HitScoreRow = {
  userId: string;
  displayName: string;
  pfpUrl: string;
  correctCount: number;
};

type HangmanSfxKind = 'lock' | 'hit' | 'miss' | 'won' | 'lost';

const HANGMAN_SFX: Record<
  HangmanSfxKind,
  { frequencies: readonly number[]; duration: number; gain: number }
> = {
  lock: { frequencies: [440, 660], duration: 0.09, gain: 0.028 },
  hit: { frequencies: [660, 880], duration: 0.1, gain: 0.026 },
  miss: { frequencies: [300, 240], duration: 0.12, gain: 0.022 },
  won: { frequencies: [523, 659, 784], duration: 0.15, gain: 0.025 },
  lost: { frequencies: [330, 277], duration: 0.16, gain: 0.018 },
} as const;

let hangmanSfxCtx: AudioContext | null = null;
let lastSfxAt = 0;
let pendingGuessTimer: ReturnType<typeof setTimeout> | null = null;

function clearPendingGuessTimer(): void {
  if (pendingGuessTimer != null) {
    clearTimeout(pendingGuessTimer);
    pendingGuessTimer = null;
  }
}

/** Avoid hijacking letters while the user is typing elsewhere (e.g. chat). */
function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  const host = el.closest('textarea, select, input, [contenteditable]');
  if (host instanceof HTMLTextAreaElement || host instanceof HTMLSelectElement)
    return true;
  if (host instanceof HTMLInputElement) {
    const nonTyping = new Set([
      'button',
      'checkbox',
      'color',
      'file',
      'hidden',
      'image',
      'radio',
      'range',
      'reset',
      'submit',
    ]);
    return !nonTyping.has(host.type.toLowerCase());
  }
  if (host instanceof HTMLElement && host.isContentEditable) return true;
  return false;
}

const phraseDraft = ref('');
const commitError = ref('');
const statusLine = ref('');
const pendingLocalGuess = ref<string | null>(null);
const guessSyncStalled = ref(false);
const lastRoundResultSfxKey = ref<string | null>(null);
const guessInputEl = ref<HTMLInputElement | null>(null);
const guessInputFocused = ref(false);

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

const nextBodyPart = computed(() => BODY_PARTS[wrongCount.value] ?? null);

const drawnBodyParts = computed(() => BODY_PARTS.slice(0, wrongCount.value));

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

function getHangmanSfxContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!hangmanSfxCtx) {
    const win = window as Window &
      typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      };
    const AudioContextCtor = win.AudioContext ?? win.webkitAudioContext;
    if (!AudioContextCtor) return null;
    try {
      hangmanSfxCtx = new AudioContextCtor();
    } catch {
      return null;
    }
  }
  return hangmanSfxCtx;
}

function playHangmanSfx(kind: HangmanSfxKind): void {
  if (!notificationPreferences.settings.soundEffects) return;
  const now = Date.now();
  if (now - lastSfxAt < 70) return;
  lastSfxAt = now;

  const ctx = getHangmanSfxContext();
  const spec = HANGMAN_SFX[kind];
  if (!ctx || !spec) return;

  const master =
    Math.max(
      0,
      Math.min(100, notificationPreferences.settings.soundEffectsMasterVolume),
    ) / 100;
  const gain = spec.gain * master;
  if (gain <= 0) return;

  const start = () => {
    const baseTime = ctx.currentTime;
    spec.frequencies.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const t = baseTime + index * 0.045;
      osc.type = 'sine';
      osc.frequency.value = frequency;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, t + spec.duration);
      osc.connect(env);
      env.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + spec.duration + 0.02);
    });
  };

  if (ctx.state === 'suspended') {
    void ctx
      .resume()
      .then(start)
      .catch(() => {});
    return;
  }
  start();
}

watch(
  () => act.value,
  (st) => {
    if (!st) {
      statusLine.value =
        'Waiting for the voice room. Join voice and open Hangman here so everyone sees the same game.';
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
    guessInputEl.value?.blur();
    guessInputFocused.value = false;
  },
);

watch(canTypeGuess, (allowed) => {
  if (!allowed) {
    guessInputEl.value?.blur();
    guessInputFocused.value = false;
  }
});

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

function clearGuessInputField(): void {
  const el = guessInputEl.value;
  if (el) el.value = '';
}

function focusGuessInput(): void {
  if (!canTypeGuess.value) return;
  guessInputEl.value?.focus();
}

function onGuessInputFocus(): void {
  guessInputFocused.value = true;
}

function onGuessInputBlur(): void {
  guessInputFocused.value = false;
  clearGuessInputField();
}

function applyTypedGuess(raw: string): void {
  const c = raw
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(-1);
  if (!c) return;
  tryLetter(c);
  clearGuessInputField();
}

function onGuessInput(e: Event): void {
  if (!canTypeGuess.value) return;
  const el = e.target;
  if (!(el instanceof HTMLInputElement)) return;
  applyTypedGuess(el.value);
}

function onGuessInputKeydown(e: KeyboardEvent): void {
  if (!canTypeGuess.value) return;
  if (e.key === 'Escape') {
    guessInputEl.value?.blur();
    return;
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    return;
  }
  if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
    e.preventDefault();
    tryLetter(e.key);
    clearGuessInputField();
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (isEditableKeyboardTarget(e.target)) return;
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
  if (m.includes(c)) return 'hm-key--hit';
  return 'hm-key--miss';
}

function keyButtonLabel(ch: string): string {
  const c = ch.toUpperCase();
  if (!guessed.value[c]) return `Guess ${c}`;
  const m = act.value?.mask ?? '';
  return m.includes(c) ? `${c} was correct` : `${c} was a miss`;
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  clearPendingGuessTimer();
  guessInputEl.value?.blur();
});

const hangmanSvgParts = computed(() => wrongCount.value);
</script>

<template>
  <div class="hm-game" role="application" aria-label="Echo voice Hangman">
    <!-- ─── Header ───────────────────────────────────────────── -->
    <header class="hm-header">
      <div class="hm-header__brand">
        <svg
          class="hm-header__rope-icon"
          viewBox="0 0 22 28"
          fill="none"
          aria-hidden="true"
        >
          <line
            x1="11"
            y1="2"
            x2="11"
            y2="6"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          />
          <line
            x1="4"
            y1="6"
            x2="18"
            y2="6"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          />
          <line
            x1="18"
            y1="6"
            x2="18"
            y2="12"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          />
          <path
            d="M18 12 Q18 17 14 18"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            fill="none"
          />
          <circle
            cx="12"
            cy="22"
            r="5"
            stroke="currentColor"
            stroke-width="2.2"
            fill="none"
          />
        </svg>
        <span class="hm-header__wordmark">Hangman</span>
        <span class="hm-header__badge">Voice</span>
      </div>
      <div class="hm-header__right">
        <div v-if="hangmanRosterUserIds.length" class="hm-players">
          <span class="hm-players__dot" aria-hidden="true" />
          <span class="hm-players__text">{{ rosterLabel }}</span>
        </div>
        <details class="hm-rules">
          <summary class="hm-rules__btn" aria-label="How to play">
            <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle
                cx="9"
                cy="9"
                r="8"
                stroke="currentColor"
                stroke-width="1.6"
              />
              <path
                d="M9 8.2v4.8M9 5.5v1"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
          </summary>
          <div class="hm-rules__panel">
            <p class="hm-rules__title">How it works</p>
            <ul class="hm-rules__list">
              <li>
                <strong>Setter</strong> types a secret A–Z phrase. Everyone else
                sees blanks.
              </li>
              <li>
                <strong>Guessers</strong> pick one letter per turn. Green =
                correct, red = miss.
              </li>
              <li>
                <strong>6 misses</strong> completes the drawing and ends the
                round.
              </li>
              <li>
                <strong>Turns</strong> rotate round-robin through everyone in
                this voice room.
              </li>
              <li>
                <strong>Sync</strong> — the roster host can apply guesses if the
                setter’s connection blips.
              </li>
            </ul>
          </div>
        </details>
      </div>
    </header>

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
      <p class="hm-empty__title">Waiting for the game</p>
      <p class="hm-empty__body">
        Join a voice channel and open Hangman so Echo can sync everyone to the
        same round.
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

      <!-- ─── Setter: phrase entry card ─────────────────────── -->
      <div v-if="act.phase === 'setter_picking' && isSetter" class="hm-setter">
        <div class="hm-setter__intro">
          <p class="hm-setter__eyebrow">Your turn to set the puzzle</p>
          <p class="hm-setter__hint">
            Type any phrase using A–Z and spaces. Everyone else only sees blanks
            until they guess.
          </p>
        </div>
        <textarea
          id="vc-hangman-phrase"
          v-model="phraseDraft"
          rows="2"
          :maxlength="VC_HANGMAN_MAX_LEN"
          class="hm-setter__input"
          placeholder="e.g. ECHO PARTY LINE"
          autocomplete="off"
          autocapitalize="characters"
        />
        <div class="hm-setter__footer">
          <span class="hm-setter__count">{{ phraseHelp }}</span>
          <p v-if="commitError" class="hm-setter__error" role="alert">
            {{ commitError }}
          </p>
          <button
            type="button"
            class="hm-btn hm-btn--lock"
            @click="onSubmitPhrase"
          >
            <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <rect
                x="3"
                y="8"
                width="12"
                height="9"
                rx="2"
                stroke="currentColor"
                stroke-width="1.8"
              />
              <path
                d="M6 8V6a3 3 0 0 1 6 0v2"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
            Lock in phrase
          </button>
        </div>
      </div>

      <!-- ─── Setter: waiting for phrase ────────────────────── -->
      <div
        v-if="act.phase === 'setter_picking' && !isSetter"
        class="hm-waiting"
      >
        <div class="hm-waiting__dots" aria-hidden="true">
          <span class="hm-waiting__dot" />
          <span class="hm-waiting__dot" />
          <span class="hm-waiting__dot" />
        </div>
        <p class="hm-waiting__who">{{ displayNameFor(act.setterUserId) }}</p>
        <p class="hm-waiting__label">is crafting the secret phrase…</p>
      </div>

      <!-- ─── Main arena: scaffold + puzzle ─────────────────── -->
      <div
        v-if="act.phase === 'guessing' || act.phase === 'round_over'"
        class="hm-arena"
      >
        <div class="hm-arena__left">
          <!-- Gallows scene panel -->
          <div class="hm-scaffold">
            <svg
              class="hm-scaffold__svg"
              viewBox="0 0 200 240"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              :aria-label="`${wrongCount} wrong ${wrongCount === 1 ? 'guess' : 'guesses'}. ${drawnBodyParts.length ? 'Body parts drawn: ' + drawnBodyParts.join(', ') + '.' : 'No body parts drawn yet.'}`"
              :data-damage="wrongCount"
              :data-outcome="
                act.phase === 'round_over' ? act.roundResult : null
              "
            >
              <defs>
                <linearGradient id="hm-sky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#05030e" />
                  <stop offset="100%" stop-color="#0c0920" />
                </linearGradient>
                <linearGradient id="hm-wood-v" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stop-color="#2e1a0c" />
                  <stop offset="30%" stop-color="#5c3820" />
                  <stop offset="70%" stop-color="#4a2d16" />
                  <stop offset="100%" stop-color="#2a1608" />
                </linearGradient>
                <linearGradient id="hm-wood-h" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#6b4224" />
                  <stop offset="55%" stop-color="#4a2d16" />
                  <stop offset="100%" stop-color="#281508" />
                </linearGradient>
                <linearGradient id="hm-floor-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#2a1a0a" />
                  <stop offset="100%" stop-color="#180e04" />
                </linearGradient>
                <linearGradient id="hm-rope-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#a08060" />
                  <stop offset="100%" stop-color="#6b4e30" />
                </linearGradient>
                <radialGradient id="hm-ambient" cx="50%" cy="40%" r="50%">
                  <stop offset="0%" stop-color="#e8d5a3" stop-opacity="0.08" />
                  <stop offset="100%" stop-color="#e8d5a3" stop-opacity="0" />
                </radialGradient>
                <radialGradient id="hm-ambient-warn" cx="50%" cy="40%" r="50%">
                  <stop offset="0%" stop-color="#fb923c" stop-opacity="0.16" />
                  <stop offset="100%" stop-color="#fb923c" stop-opacity="0" />
                </radialGradient>
                <radialGradient id="hm-ambient-crit" cx="50%" cy="40%" r="50%">
                  <stop offset="0%" stop-color="#ef4444" stop-opacity="0.22" />
                  <stop offset="100%" stop-color="#ef4444" stop-opacity="0" />
                </radialGradient>
                <filter
                  id="hm-glow-filter"
                  x="-30%"
                  y="-30%"
                  width="160%"
                  height="160%"
                >
                  <feGaussianBlur
                    in="SourceGraphic"
                    stdDeviation="2.5"
                    result="blur"
                  />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <!-- Sky -->
              <rect width="200" height="240" fill="url(#hm-sky)" />

              <!-- Stars -->
              <g fill="white">
                <circle cx="20" cy="16" r="0.9" opacity="0.55" />
                <circle cx="52" cy="10" r="0.6" opacity="0.45" />
                <circle cx="75" cy="26" r="1.1" opacity="0.6" />
                <circle cx="32" cy="44" r="0.5" opacity="0.4" />
                <circle cx="108" cy="13" r="0.7" opacity="0.5" />
                <circle cx="17" cy="62" r="0.6" opacity="0.35" />
                <circle cx="46" cy="52" r="0.5" opacity="0.4" />
                <circle cx="90" cy="7" r="0.9" opacity="0.55" />
                <circle cx="128" cy="20" r="0.6" opacity="0.45" />
                <circle cx="140" cy="48" r="0.5" opacity="0.35" />
                <circle cx="62" cy="35" r="0.4" opacity="0.3" />
              </g>

              <!-- Ambient figure glow (reactive to damage) -->
              <ellipse
                v-if="hangmanSvgParts > 0"
                cx="154"
                cy="130"
                rx="38"
                ry="55"
                :fill="
                  hangmanSvgParts >= 5
                    ? 'url(#hm-ambient-crit)'
                    : hangmanSvgParts >= 3
                      ? 'url(#hm-ambient-warn)'
                      : 'url(#hm-ambient)'
                "
              />

              <!-- Floor platform -->
              <rect
                x="8"
                y="204"
                width="184"
                height="16"
                rx="4"
                fill="url(#hm-floor-grad)"
              />
              <line
                x1="8"
                y1="207"
                x2="192"
                y2="207"
                stroke="#6b4224"
                stroke-width="0.6"
                opacity="0.3"
              />
              <line
                x1="8"
                y1="212"
                x2="192"
                y2="212"
                stroke="#6b4224"
                stroke-width="0.6"
                opacity="0.2"
              />
              <!-- Platform edge highlight -->
              <line
                x1="8"
                y1="204.5"
                x2="192"
                y2="204.5"
                stroke="white"
                stroke-width="0.5"
                opacity="0.08"
              />
              <!-- Platform shadow -->
              <ellipse
                cx="100"
                cy="220"
                rx="90"
                ry="5"
                fill="black"
                opacity="0.5"
              />

              <!-- Gallows: vertical post -->
              <rect
                x="34"
                y="36"
                width="11"
                height="170"
                rx="3.5"
                fill="url(#hm-wood-v)"
              />
              <!-- Post highlight edge -->
              <line
                x1="35.5"
                y1="38"
                x2="35.5"
                y2="204"
                stroke="white"
                stroke-width="0.5"
                opacity="0.1"
              />
              <!-- Post grain -->
              <line
                x1="40"
                y1="38"
                x2="40"
                y2="204"
                stroke="#7c4a28"
                stroke-width="0.8"
                opacity="0.35"
              />

              <!-- Gallows: diagonal brace -->
              <path
                d="M45 82 L62 58"
                fill="none"
                stroke="#3d2010"
                stroke-width="10"
                stroke-linecap="round"
              />
              <path
                d="M45 82 L62 58"
                fill="none"
                stroke="#5c3820"
                stroke-width="7"
                stroke-linecap="round"
              />
              <path
                d="M45 82 L62 58"
                fill="none"
                stroke="#6b4224"
                stroke-width="4.5"
                stroke-linecap="round"
              />

              <!-- Gallows: horizontal beam -->
              <rect
                x="34"
                y="28"
                width="124"
                height="12"
                rx="3.5"
                fill="url(#hm-wood-h)"
              />
              <line
                x1="37"
                y1="29.5"
                x2="155"
                y2="29.5"
                stroke="white"
                stroke-width="0.5"
                opacity="0.1"
              />
              <line
                x1="37"
                y1="34"
                x2="155"
                y2="34"
                stroke="#7c4a28"
                stroke-width="0.8"
                opacity="0.35"
              />

              <!-- Gallows: vertical drop from beam -->
              <rect
                x="151"
                y="40"
                width="6"
                height="26"
                rx="2"
                fill="url(#hm-wood-v)"
                opacity="0.9"
              />

              <!-- Rope noose -->
              <path
                d="M154 66 Q153 71 154 76"
                fill="none"
                stroke="url(#hm-rope-grad)"
                stroke-width="3.2"
                stroke-linecap="round"
              />
              <!-- Rope knot detail -->
              <ellipse
                cx="154"
                cy="78"
                rx="4"
                ry="3"
                fill="none"
                stroke="#8b6840"
                stroke-width="1.5"
              />

              <!-- ── Figure parts ── -->
              <!-- Each part uses pathLength="1" so stroke-dashoffset: 1 = hidden, 0 = drawn -->

              <!-- 1. Head -->
              <g
                class="hm-part"
                :class="{ 'hm-part--active': hangmanSvgParts >= 1 }"
              >
                <circle
                  cx="154"
                  cy="92"
                  r="13"
                  pathLength="1"
                  fill="none"
                  stroke-width="3"
                />
                <!-- Dot eyes (alive) -->
                <circle
                  v-if="
                    !(act.phase === 'round_over' && act.roundResult === 'lost')
                  "
                  cx="150"
                  cy="90"
                  r="2"
                  class="hm-face-dot"
                  :class="{ 'hm-face-dot--show': hangmanSvgParts >= 1 }"
                  fill="currentColor"
                />
                <circle
                  v-if="
                    !(act.phase === 'round_over' && act.roundResult === 'lost')
                  "
                  cx="158"
                  cy="90"
                  r="2"
                  class="hm-face-dot"
                  :class="{ 'hm-face-dot--show': hangmanSvgParts >= 1 }"
                  fill="currentColor"
                />
                <!-- X eyes (dead) -->
                <g
                  v-if="
                    act.phase === 'round_over' &&
                    act.roundResult === 'lost' &&
                    hangmanSvgParts >= 1
                  "
                  class="hm-face-dead"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <line x1="147" y1="87" x2="153" y2="93" />
                  <line x1="153" y1="87" x2="147" y2="93" />
                  <line x1="155" y1="87" x2="161" y2="93" />
                  <line x1="161" y1="87" x2="155" y2="93" />
                </g>
                <!-- Mouth line (neutral/grim) -->
                <path
                  v-if="hangmanSvgParts >= 1"
                  :d="
                    act.phase === 'round_over' && act.roundResult === 'lost'
                      ? 'M150 96 Q154 94 158 96'
                      : 'M150 96 Q154 98 158 96'
                  "
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  class="hm-face-dot"
                  :class="{ 'hm-face-dot--show': hangmanSvgParts >= 1 }"
                />
              </g>

              <!-- 2. Body -->
              <g
                class="hm-part"
                :class="{ 'hm-part--active': hangmanSvgParts >= 2 }"
              >
                <line
                  x1="154"
                  y1="105"
                  x2="154"
                  y2="150"
                  pathLength="1"
                  stroke-width="3.5"
                  stroke-linecap="round"
                />
              </g>

              <!-- 3. Left arm -->
              <g
                class="hm-part"
                :class="{ 'hm-part--active': hangmanSvgParts >= 3 }"
              >
                <path
                  d="M154 117 Q140 126 130 138"
                  pathLength="1"
                  fill="none"
                  stroke-width="3"
                  stroke-linecap="round"
                />
              </g>

              <!-- 4. Right arm -->
              <g
                class="hm-part"
                :class="{ 'hm-part--active': hangmanSvgParts >= 4 }"
              >
                <path
                  d="M154 117 Q168 126 178 138"
                  pathLength="1"
                  fill="none"
                  stroke-width="3"
                  stroke-linecap="round"
                />
              </g>

              <!-- 5. Left leg -->
              <g
                class="hm-part"
                :class="{ 'hm-part--active': hangmanSvgParts >= 5 }"
              >
                <path
                  d="M154 150 Q145 165 137 180"
                  pathLength="1"
                  fill="none"
                  stroke-width="3"
                  stroke-linecap="round"
                />
              </g>

              <!-- 6. Right leg -->
              <g
                class="hm-part"
                :class="{ 'hm-part--active': hangmanSvgParts >= 6 }"
              >
                <path
                  d="M154 150 Q163 165 171 180"
                  pathLength="1"
                  fill="none"
                  stroke-width="3"
                  stroke-linecap="round"
                />
              </g>

              <!-- Foot shadow (once both legs exist) -->
              <ellipse
                v-if="hangmanSvgParts >= 5"
                cx="154"
                cy="186"
                rx="20"
                ry="3"
                fill="black"
                opacity="0.4"
              />
            </svg>

            <p class="hm-scaffold__caption">
              <template v-if="act.phase === 'round_over'">
                Ended with <strong>{{ wrongCount }}</strong>
                {{ wrongCount === 1 ? 'miss' : 'misses' }}
              </template>
              <template v-else-if="wrongCount === 0">
                No misses yet — looking good
              </template>
              <template v-else>
                Next miss draws: <strong>{{ nextBodyPart }}</strong>
              </template>
            </p>
          </div>

          <div class="hm-sidebar">
            <div v-if="guessLogEntries.length" class="hm-guess-log">
              <p class="hm-guess-log__title">Guess history</p>
              <ol class="hm-guess-log__list">
                <li
                  v-for="(row, idx) in guessLogEntries"
                  :key="`glog-${idx}-${row.letter}-${row.userId}`"
                  class="hm-guess-log__row"
                  :class="
                    row.hit
                      ? 'hm-guess-log__row--hit'
                      : 'hm-guess-log__row--miss'
                  "
                >
                  <div class="hm-guess-log__meta">
                    <span class="hm-guess-log__phrase"
                      >{{ row.displayName }} guessed</span
                    >
                    <span class="hm-guess-log__letter" aria-hidden="true">{{
                      row.letter
                    }}</span>
                  </div>
                  <span
                    class="hm-guess-log__verdict"
                    :class="
                      row.hit
                        ? 'hm-guess-log__verdict--hit'
                        : 'hm-guess-log__verdict--miss'
                    "
                    >{{ row.hit ? 'Hit' : 'Miss' }}</span
                  >
                </li>
              </ol>
            </div>

            <div class="hm-hit-board">
              <p class="hm-hit-board__title">Correct guesses</p>
              <template v-if="hitScoreboard.length">
                <p v-if="topHitScorer" class="hm-hit-board__lead">
                  <span class="hm-hit-board__lead-label">{{
                    topHitIsTied ? 'Top (tied)' : 'Top'
                  }}</span>
                  <span class="hm-hit-board__lead-name">{{
                    topHitTiedNames
                  }}</span>
                  <span class="hm-hit-board__lead-count">{{
                    topHitScorer.correctCount
                  }}</span>
                </p>
                <ol class="hm-hit-board__list">
                  <li
                    v-for="(row, idx) in hitScoreboard"
                    :key="`hit-${row.userId || 'unk'}-${idx}`"
                    class="hm-hit-board__row"
                    :class="{ 'hm-hit-board__row--first': idx === 0 }"
                  >
                    <span class="hm-hit-board__rank" aria-hidden="true">{{
                      idx + 1
                    }}</span>
                    <div class="hm-hit-board__avatar" aria-hidden="true">
                      <PausedGifAvatar
                        :src="safeImageUrl(row.pfpUrl)"
                        :alt="row.displayName"
                        :session-key="row.userId || `hit-${idx}`"
                        wrapper-class="relative block h-6 w-6 shrink-0 overflow-hidden rounded-full ring-1 ring-white/12"
                        img-class="rounded-full object-cover"
                      />
                    </div>
                    <span class="hm-hit-board__name">{{
                      row.displayName
                    }}</span>
                    <span class="hm-hit-board__score">{{
                      row.correctCount
                    }}</span>
                  </li>
                </ol>
              </template>
              <p v-else class="hm-hit-board__empty">No letter hits yet</p>
            </div>
          </div>
        </div>
        <!-- /hm-arena__left -->

        <!-- Puzzle panel -->
        <div class="hm-puzzle-panel">
          <!-- Letter tiles -->
          <div class="hm-tiles" aria-live="polite" aria-atomic="true">
            <div
              v-for="(word, wi) in puzzleWords"
              :key="word.id"
              class="hm-word"
            >
              <span
                v-for="(slot, si) in word.slots"
                :key="word.id + '-' + si"
                class="hm-tile"
                :class="
                  slot === '_'
                    ? [
                        'hm-tile--blank',
                        {
                          'hm-tile--blank-pulse':
                            act.phase === 'guessing' && !isSetter,
                        },
                      ]
                    : ['hm-tile--lit', { 'hm-tile--fresh': slot === lastGuess }]
                "
                :aria-label="
                  slot === '_'
                    ? `Word ${wi + 1}, letter ${si + 1}, hidden`
                    : `Word ${wi + 1}, letter ${si + 1}, ${slot}`
                "
                >{{ slot === '_' ? '' : slot }}</span
              >
            </div>
          </div>

          <!-- Answer reveal on loss -->
          <div
            v-if="act.phase === 'round_over' && act.roundResult === 'lost'"
            class="hm-answer"
          >
            <span class="hm-answer__eyebrow">The phrase was</span>
            <span class="hm-answer__text">{{ act.answerReveal ?? '—' }}</span>
          </div>

          <!-- Letter tracker: hits + misses side by side -->
          <div class="hm-tracker">
            <div class="hm-tracker__col">
              <span class="hm-tracker__label hm-tracker__label--hit">
                <svg viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path
                    d="M1.5 5l2.5 2.5 4.5-5"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                Correct
              </span>
              <div class="hm-tracker__chips">
                <span
                  v-for="l in hitLetters"
                  :key="'h-' + l"
                  class="hm-chip hm-chip--hit"
                  :class="{ 'hm-chip--fresh': l === lastGuess }"
                  >{{ l }}</span
                >
                <span v-if="!hitLetters.length" class="hm-tracker__empty"
                  >none yet</span
                >
              </div>
            </div>
            <div class="hm-tracker__divider" aria-hidden="true" />
            <div class="hm-tracker__col">
              <span class="hm-tracker__label hm-tracker__label--miss">
                <svg viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path
                    d="M2 2l6 6M8 2L2 8"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                  />
                </svg>
                Missed
              </span>
              <div class="hm-tracker__chips">
                <span
                  v-for="l in missedLetters"
                  :key="'m-' + l"
                  class="hm-chip hm-chip--miss"
                  :class="{ 'hm-chip--fresh': l === lastGuess }"
                  >{{ l }}</span
                >
                <span v-if="!missedLetters.length" class="hm-tracker__empty"
                  >none yet</span
                >
              </div>
            </div>
          </div>

          <!-- Last guess feedback -->
          <div
            v-if="lastGuess && act.phase === 'guessing'"
            class="hm-feedback"
            :class="lastGuessWasHit ? 'hm-feedback--hit' : 'hm-feedback--miss'"
          >
            <div class="hm-feedback__main">
              <span class="hm-feedback__who">{{ lastGuessDisplayName }}</span>
              <div class="hm-feedback__guess">
                <span class="hm-feedback__letter">{{ lastGuess }}</span>
                <span class="hm-feedback__verdict">{{
                  lastGuessWasHit ? 'correct!' : 'miss'
                }}</span>
              </div>
            </div>
          </div>
        </div>
        <!-- /hm-puzzle-panel -->
      </div>
      <!-- /hm-arena -->

      <!-- ─── Keyboard ──────────────────────────────────────── -->
      <div v-if="act.phase === 'guessing' && !isSetter" class="hm-keyboard">
        <p v-if="guessSyncStalled" class="hm-sync-stall" role="status">
          Guess didn’t sync — check voice connection or wait for the roster
          host. Try again or use the letter box below.
        </p>
        <div
          class="hm-type-guess"
          :class="{
            'hm-type-guess--focused': guessInputFocused,
            'hm-type-guess--disabled': !canTypeGuess,
          }"
          role="group"
          :aria-label="
            guessInputFocused
              ? 'Type a letter guess on your keyboard'
              : 'Click to type a letter guess on your keyboard'
          "
          @click="focusGuessInput"
        >
          <input
            ref="guessInputEl"
            type="text"
            inputmode="text"
            maxlength="8"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            enterkeyhint="done"
            class="hm-type-guess__input"
            :disabled="!canTypeGuess"
            :tabindex="canTypeGuess ? 0 : -1"
            aria-label="Letter guess"
            @focus="onGuessInputFocus"
            @blur="onGuessInputBlur"
            @input="onGuessInput"
            @keydown="onGuessInputKeydown"
          />
          <span class="hm-type-guess__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect
                x="2"
                y="6"
                width="20"
                height="12"
                rx="2"
                stroke="currentColor"
                stroke-width="1.6"
              />
              <path
                d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <span class="hm-type-guess__label">
            <span class="hm-type-guess__title">{{
              guessInputFocused ? 'Typing…' : 'Type a letter'
            }}</span>
            <span class="hm-type-guess__hint">{{
              guessInputFocused
                ? 'Press A–Z · Esc to leave'
                : 'Click here, then use your keyboard'
            }}</span>
          </span>
        </div>
        <div
          v-for="(row, ri) in KEYBOARD_ROWS"
          :key="'kr-' + ri"
          class="hm-key-row"
          :style="{ '--hm-key-count': String(row.length) }"
        >
          <button
            v-for="k in row"
            :key="k"
            type="button"
            class="hm-key"
            :class="[keyButtonClass(k), { 'hm-key--fresh': k === lastGuess }]"
            :disabled="!!guessed[k]"
            :aria-label="keyButtonLabel(k)"
            :title="keyButtonLabel(k)"
            @click="tryLetter(k)"
          >
            {{ k }}
          </button>
        </div>
      </div>

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

/* ── Header ─────────────────────────────────────────────────── */
.hm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--hm-border);
  background: rgba(255, 255, 255, 0.018);
  flex-shrink: 0;
}

.hm-header__brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.hm-header__rope-icon {
  width: 1.25rem;
  height: 1.6rem;
  color: var(--hm-accent);
  flex-shrink: 0;
}

.hm-header__wordmark {
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--hm-text);
}

.hm-header__badge {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--hm-text-muted);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--hm-border);
  border-radius: 4px;
  padding: 0.1rem 0.45rem;
}

.hm-header__right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.hm-players {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 14rem;
  overflow: hidden;
}

.hm-players__dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--hm-hit);
  flex-shrink: 0;
  box-shadow: 0 0 5px var(--hm-hit-glow);
}

.hm-players__text {
  font-size: 0.72rem;
  color: var(--hm-text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Rules dropdown ─────────────────────────────────────────── */
.hm-rules {
  position: relative;
}

.hm-rules__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  cursor: pointer;
  color: var(--hm-text-muted);
  transition:
    color 0.15s,
    background 0.15s;
  list-style: none;

  &:hover {
    color: var(--hm-text-soft);
    background: rgba(255, 255, 255, 0.06);
  }

  svg {
    width: 1.1rem;
    height: 1.1rem;
  }
}

.hm-rules__btn::-webkit-details-marker {
  display: none;
}

.hm-rules__panel {
  position: absolute;
  right: 0;
  top: calc(100% + 0.5rem);
  z-index: 30;
  width: 18rem;
  background: #1a1730;
  border: 1px solid var(--hm-border-mid);
  border-radius: 10px;
  padding: 1rem;
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.04);
}

.hm-rules__title {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--hm-accent);
  margin-bottom: 0.6rem;
}

.hm-rules__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;

  li {
    font-size: 0.78rem;
    line-height: 1.5;
    color: var(--hm-text-soft);
    padding-left: 1rem;
    position: relative;

    &::before {
      content: '·';
      position: absolute;
      left: 0;
      color: var(--hm-text-muted);
    }

    strong {
      color: var(--hm-text);
      font-weight: 600;
    }
  }
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

/* ── Setter card ─────────────────────────────────────────────── */
.hm-setter {
  margin: 0.75rem;
  padding: 1.25rem;
  background: var(--hm-surface);
  border: 1px solid var(--hm-border-mid);
  border-radius: var(--hm-radius);
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
}

.hm-setter__eyebrow {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--hm-accent);
  margin-bottom: 0.2rem;
}

.hm-setter__hint {
  font-size: 0.8rem;
  color: var(--hm-text-soft);
  line-height: 1.5;
}

.hm-setter__input {
  width: 100%;
  min-height: 4rem;
  resize: vertical;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--hm-border-mid);
  border-radius: 8px;
  padding: 0.7rem 0.85rem;
  color: var(--hm-text);
  font-size: 0.9rem;
  font-family: var(--font-mono, ui-monospace, monospace);
  letter-spacing: 0.08em;
  outline: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;

  &::placeholder {
    color: var(--hm-text-muted);
    letter-spacing: 0.04em;
  }

  &:focus {
    border-color: rgba(245, 158, 11, 0.5);
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
  }
}

.hm-setter__footer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.hm-setter__count {
  font-size: 0.72rem;
  color: var(--hm-text-muted);
  flex: 1;
  min-width: 0;
}

.hm-setter__error {
  font-size: 0.75rem;
  color: var(--hm-miss);
  font-weight: 500;
  width: 100%;
  order: 3;
}

/* ── Waiting state ───────────────────────────────────────────── */
.hm-waiting {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  padding: 2.5rem 1.5rem;
  text-align: center;
}

.hm-waiting__dots {
  display: flex;
  gap: 0.45rem;
  margin-bottom: 0.5rem;
}

.hm-waiting__dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: var(--hm-accent);
  animation: hm-waiting-bounce 1.2s ease-in-out infinite;

  &:nth-child(2) {
    animation-delay: 0.18s;
  }
  &:nth-child(3) {
    animation-delay: 0.36s;
  }
}

.hm-waiting__who {
  font-size: 1rem;
  font-weight: 700;
  color: var(--hm-text);
}

.hm-waiting__label {
  font-size: 0.82rem;
  color: var(--hm-text-soft);
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

.hm-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  min-width: 0;
}

/* ── Scaffold / gallows scene ────────────────────────────────── */
.hm-scaffold {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  background: var(--hm-surface);
  border: 1px solid var(--hm-border);
  border-radius: var(--hm-radius);
  padding: 0.75rem;
  /* subtle inner shadow for "stage" depth */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    inset 0 -1px 0 rgba(0, 0, 0, 0.4),
    0 4px 20px rgba(0, 0, 0, 0.4);
  flex-shrink: 0;
}

@media (min-width: 680px) {
  .hm-scaffold {
    width: 13.5rem;
  }
}

.hm-scaffold__svg {
  width: 100%;
  max-width: 12rem;
  height: auto;
  display: block;
}

/* Figure parts: inactive = ghost outline, active = drawn in */
.hm-part {
  stroke: rgba(255, 255, 255, 0.1);
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  fill: none;
  transition: stroke 0.5s ease;
}

.hm-part--active {
  stroke: var(--hm-figure);
  stroke-dashoffset: 0;
  animation: hm-draw-part 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

/* Progressive danger coloring on the SVG via data-damage attribute */
.hm-scaffold__svg[data-damage='3'] .hm-part--active {
  stroke: #f0c060;
}
.hm-scaffold__svg[data-damage='4'] .hm-part--active {
  stroke: #f97316;
}
.hm-scaffold__svg[data-damage='5'] .hm-part--active {
  stroke: #f87171;
}
.hm-scaffold__svg[data-damage='6'] .hm-part--active {
  stroke: #dc2626;
}

/* Dead outcome: entire figure turns red */
.hm-scaffold__svg[data-outcome='lost'] .hm-part--active {
  stroke: #ef4444;
}

/* Face details: fade in after head appears */
.hm-face-dot {
  opacity: 0;
  transition: opacity 0.3s ease 0.45s;
  color: var(--hm-figure);
}

.hm-face-dot--show {
  opacity: 0.85;
}

.hm-scaffold__svg[data-outcome='lost'] .hm-face-dot {
  color: #ef4444;
}

.hm-face-dead {
  stroke: #ef4444;
  opacity: 0;
  animation: hm-face-appear 0.3s ease 0.2s forwards;
}

.hm-scaffold__caption {
  font-size: 0.72rem;
  color: var(--hm-text-muted);
  text-align: center;
  line-height: 1.4;

  strong {
    color: var(--hm-text-soft);
    font-weight: 600;
  }
}

/* ── Puzzle panel ────────────────────────────────────────────── */
.hm-puzzle-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
  flex: 1;
}

/* ── Tiles ───────────────────────────────────────────────────── */
.hm-tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1rem;
  align-items: flex-start;
  justify-content: center;
  padding: 0.85rem 0.5rem;
  background: var(--hm-surface);
  border: 1px solid var(--hm-border);
  border-radius: var(--hm-radius);
  min-height: 5.5rem;
}

.hm-word {
  display: flex;
  gap: 0.28rem;
  align-items: flex-end;
  flex-wrap: nowrap;
}

.hm-tile {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: clamp(1.85rem, 5.5vw, 2.35rem);
  height: clamp(2.4rem, 7vw, 3rem);
  border-radius: 6px;
  font-size: clamp(0.9rem, 2.8vw, 1.25rem);
  font-weight: 800;
  letter-spacing: 0.04em;
  font-family: var(--font-mono, ui-monospace, monospace);
  transition:
    background 0.2s,
    border-color 0.25s,
    box-shadow 0.25s;
}

.hm-tile--blank {
  background: rgba(255, 255, 255, 0.025);
  border: 2px solid rgba(255, 255, 255, 0.07);
  border-bottom-color: rgba(255, 255, 255, 0.18);
  color: transparent;
}

.hm-tile--blank-pulse {
  border-bottom-color: rgba(245, 158, 11, 0.35);
}

.hm-tile--lit {
  background: rgba(255, 255, 255, 0.07);
  border: 2px solid rgba(255, 255, 255, 0.13);
  border-bottom-color: rgba(255, 255, 255, 0.28);
  color: var(--hm-text);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset;
}

.hm-tile--fresh {
  background: rgba(16, 185, 129, 0.13);
  border-color: rgba(16, 185, 129, 0.45);
  box-shadow:
    0 0 12px rgba(16, 185, 129, 0.22),
    0 1px 0 rgba(255, 255, 255, 0.06) inset;
  animation: hm-tile-pop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* ── Guess history ───────────────────────────────────────────── */
.hm-guess-log {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.65rem 0.75rem;
  background: var(--hm-surface);
  border: 1px solid var(--hm-border);
  border-radius: var(--hm-radius);
  max-height: 9rem;
  min-height: 0;
}

.hm-guess-log__title {
  margin: 0;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--hm-text-muted);
}

.hm-guess-log__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  overflow-y: auto;
  min-height: 0;
}

.hm-guess-log__row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.35rem 0.45rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--hm-border);
}

.hm-guess-log__row--hit {
  border-color: rgba(16, 185, 129, 0.28);
  background: rgba(16, 185, 129, 0.06);
}

.hm-guess-log__row--miss {
  border-color: rgba(244, 63, 94, 0.2);
  background: rgba(244, 63, 94, 0.05);
}

.hm-guess-log__meta {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.hm-guess-log__phrase {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--hm-text-soft);
  flex-shrink: 0;
}

.hm-guess-log__letter {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1.35rem;
  border-radius: 5px;
  font-size: 0.75rem;
  font-weight: 900;
  font-family: var(--font-mono, ui-monospace, monospace);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--hm-text);
}

.hm-guess-log__verdict {
  flex-shrink: 0;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.hm-guess-log__verdict--hit {
  color: var(--hm-hit);
}

.hm-guess-log__verdict--miss {
  color: var(--hm-miss);
}

/* ── Hit scoreboard (per round) ─────────────────────────────── */
.hm-hit-board {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.65rem 0.75rem;
  background: var(--hm-surface);
  border: 1px solid var(--hm-border);
  border-radius: var(--hm-radius);
  min-height: 0;
}

.hm-hit-board__title {
  margin: 0;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--hm-text-muted);
}

.hm-hit-board__lead {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.5rem;
  padding: 0.35rem 0.45rem;
  border-radius: 8px;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.28);
}

.hm-hit-board__lead-label {
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hm-hit);
}

.hm-hit-board__lead-name {
  flex: 1;
  min-width: 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--hm-text);
  line-height: 1.25;
}

.hm-hit-board__lead-count {
  font-size: 0.85rem;
  font-weight: 900;
  font-family: var(--font-mono, ui-monospace, monospace);
  color: #6ee7b7;
}

.hm-hit-board__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  max-height: 8.5rem;
  overflow-y: auto;
  min-height: 0;
}

.hm-hit-board__row {
  display: grid;
  grid-template-columns: 1.1rem 1.5rem 1fr auto;
  align-items: center;
  gap: 0.35rem;
  padding: 0.28rem 0.4rem;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--hm-border);
}

.hm-hit-board__row--first {
  border-color: rgba(16, 185, 129, 0.22);
}

.hm-hit-board__rank {
  font-size: 0.62rem;
  font-weight: 800;
  color: var(--hm-text-muted);
  text-align: center;
}

.hm-hit-board__name {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--hm-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.hm-hit-board__score {
  font-size: 0.72rem;
  font-weight: 900;
  font-family: var(--font-mono, ui-monospace, monospace);
  color: var(--hm-text-soft);
}

.hm-hit-board__empty {
  margin: 0;
  font-size: 0.72rem;
  color: var(--hm-text-muted);
  font-style: italic;
  padding: 0.2rem 0;
}

/* ── Answer reveal ───────────────────────────────────────────── */
.hm-answer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.85rem 1.1rem;
  background: var(--hm-surface);
  border: 1px solid var(--hm-border-mid);
  border-radius: var(--hm-radius);
  text-align: center;
}

.hm-answer__eyebrow {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--hm-text-muted);
}

.hm-answer__text {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: clamp(0.95rem, 3vw, 1.25rem);
  font-weight: 800;
  letter-spacing: 0.14em;
  color: var(--hm-text);
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
  text-align: center;
  line-height: 1.35;
}

/* ── Letter tracker ──────────────────────────────────────────── */
.hm-tracker {
  display: flex;
  gap: 0;
  background: var(--hm-surface);
  border: 1px solid var(--hm-border);
  border-radius: var(--hm-radius);
  overflow: hidden;
}

.hm-tracker__col {
  flex: 1;
  padding: 0.65rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
}

.hm-tracker__divider {
  width: 1px;
  background: var(--hm-border);
  flex-shrink: 0;
}

@media (max-width: 440px) {
  .hm-tracker {
    flex-direction: column;
  }

  .hm-tracker__divider {
    width: 100%;
    height: 1px;
  }
}

.hm-tracker__label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;

  svg {
    width: 0.7rem;
    height: 0.7rem;
    flex-shrink: 0;
  }
}

.hm-tracker__label--hit {
  color: var(--hm-hit);
}
.hm-tracker__label--miss {
  color: var(--hm-miss);
}

.hm-tracker__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  min-height: 1.4rem;
}

.hm-tracker__empty {
  font-size: 0.72rem;
  color: var(--hm-text-muted);
  font-style: italic;
}

/* ── Chips (letter pills) ────────────────────────────────────── */
.hm-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.4rem;
  height: 1.4rem;
  border-radius: 5px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  font-family: var(--font-mono, ui-monospace, monospace);
  border: 1px solid;
  transition: box-shadow 0.2s;
}

.hm-chip--hit {
  background: var(--hm-hit-dim);
  border-color: rgba(16, 185, 129, 0.35);
  color: #6ee7b7;
}

.hm-chip--miss {
  background: var(--hm-miss-dim);
  border-color: rgba(244, 63, 94, 0.3);
  color: #fca5a5;
}

.hm-chip--fresh {
  box-shadow: 0 0 8px currentColor;
  animation: hm-chip-pop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* ── Last guess feedback ─────────────────────────────────────── */
.hm-feedback {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.45rem 1rem;
  border-radius: 999px;
  border: 1px solid;
  font-size: 0.8rem;
  font-weight: 600;
  align-self: center;
  animation: hm-feedback-in 0.28s ease-out;
  text-align: left;
  max-width: 100%;
  box-sizing: border-box;
}

@media (max-width: 420px) {
  .hm-feedback {
    border-radius: 12px;
    padding: 0.55rem 0.75rem;
    align-self: stretch;
  }

  .hm-feedback__who {
    max-width: none;
    white-space: normal;
  }
}

.hm-feedback__main {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
}

.hm-feedback__who {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--hm-text-soft);
  line-height: 1.2;
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hm-feedback__guess {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
}

.hm-feedback--hit {
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.08);
  color: #6ee7b7;
}

.hm-feedback--miss {
  border-color: rgba(244, 63, 94, 0.32);
  background: rgba(244, 63, 94, 0.07);
  color: #fca5a5;
}

.hm-feedback__letter {
  font-size: 0.95rem;
  font-weight: 900;
  font-family: var(--font-mono, ui-monospace, monospace);
}

.hm-feedback__verdict {
  font-size: 0.76rem;
  opacity: 0.85;
}

/* ── Manual letter input (click + physical keyboard) ─────────── */
.hm-type-guess {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  max-width: min(26rem, 100%);
  margin-inline: auto;
  padding: 0.62rem 0.85rem;
  border-radius: 10px;
  border: 1px dashed rgba(255, 255, 255, 0.16);
  background: linear-gradient(180deg, #12102a 0%, #0c0a1c 100%);
  color: rgba(240, 232, 255, 0.9);
  cursor: text;
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    background 140ms ease;
}

.hm-type-guess:hover:not(.hm-type-guess--disabled) {
  border-color: rgba(167, 139, 250, 0.45);
  background: linear-gradient(180deg, #18152f 0%, #100e22 100%);
}

.hm-type-guess--focused {
  border-style: solid;
  border-color: rgba(167, 139, 250, 0.65);
  box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.18);
}

.hm-type-guess--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.hm-type-guess__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: text;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  color: transparent;
  caret-color: transparent;
}

.hm-type-guess__input:focus {
  outline: none;
}

.hm-type-guess__icon {
  display: flex;
  flex-shrink: 0;
  width: 1.35rem;
  height: 1.35rem;
  color: rgba(196, 181, 253, 0.85);
}

.hm-type-guess__icon svg {
  width: 100%;
  height: 100%;
}

.hm-type-guess__label {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
  pointer-events: none;
}

.hm-type-guess__title {
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.hm-type-guess__hint {
  font-size: 0.72rem;
  color: rgba(240, 232, 255, 0.55);
}

/* ── Keyboard ────────────────────────────────────────────────── */
.hm-sync-stall {
  width: 100%;
  max-width: min(26rem, 100%);
  margin-inline: auto;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  font-size: 0.74rem;
  line-height: 1.35;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.35);
  border: 1px solid rgba(248, 113, 113, 0.35);
}

.hm-keyboard {
  --hm-key-gap: clamp(0.14rem, 1.2vw, 0.32rem);
  --hm-key-count: 10;

  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.45rem;
  padding: 0.85rem max(0.35rem, env(safe-area-inset-left, 0px)) 1rem
    max(0.35rem, env(safe-area-inset-right, 0px));
  border-top: 1px solid var(--hm-border);
  flex-shrink: 0;
}

.hm-key-row {
  display: flex;
  gap: var(--hm-key-gap);
  justify-content: center;
  flex-wrap: nowrap;
  width: 100%;
  max-width: min(26rem, 100%);
  margin-inline: auto;
}

/* Premium 3D keycap — fluid width so 10-letter row fits narrow phones */
.hm-key {
  --hm-keys: var(--hm-key-count, 10);

  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 0;
  min-width: 0;
  width: calc(
    (100% - (var(--hm-keys) - 1) * var(--hm-key-gap)) / var(--hm-keys)
  );
  max-width: 2.45rem;
  min-height: clamp(2.35rem, 9vw + 1.1rem, 2.75rem);
  height: clamp(2.35rem, 9vw + 1.1rem, 2.75rem);
  padding: 0;
  border-radius: 7px;
  font-size: clamp(0.62rem, 2.1vw + 0.35rem, 0.88rem);
  font-weight: 800;
  letter-spacing: 0.04em;
  cursor: pointer;
  /* Key face */
  background: linear-gradient(180deg, #1c1836 0%, #14112c 100%);
  color: rgba(240, 232, 255, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.1);
  /* 3D depth: bottom shadow = key bottom face */
  box-shadow:
    0 4px 0 0 var(--hm-key-depth),
    0 5px 10px rgba(0, 0, 0, 0.45);
  transform: translateY(0);
  transition:
    transform 55ms ease,
    box-shadow 55ms ease,
    background 140ms ease,
    border-color 140ms ease,
    color 140ms ease,
    opacity 140ms ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.hm-key:hover:not(:disabled) {
  background: linear-gradient(180deg, #241f48 0%, #1c1838 100%);
  transform: translateY(-2px);
  box-shadow:
    0 6px 0 0 var(--hm-key-depth),
    0 8px 14px rgba(0, 0, 0, 0.5);
}

.hm-key:active:not(:disabled) {
  transform: translateY(4px);
  box-shadow:
    0 0 0 0 var(--hm-key-depth),
    0 1px 4px rgba(0, 0, 0, 0.35);
}

.hm-key:disabled {
  cursor: default;
}

.hm-key--fresh {
  animation: hm-key-press 0.22s ease-out;
}

.hm-key--hit {
  background: linear-gradient(180deg, #0d3d2a 0%, #092a1c 100%);
  border-color: rgba(16, 185, 129, 0.4);
  color: #6ee7b7;
  box-shadow:
    0 4px 0 0 #020f09,
    0 0 14px rgba(16, 185, 129, 0.2),
    0 5px 10px rgba(0, 0, 0, 0.45);
}

.hm-key--miss {
  background: linear-gradient(180deg, #280e16 0%, #1a0810 100%);
  border-color: rgba(244, 63, 94, 0.22);
  color: rgba(252, 165, 165, 0.45);
  box-shadow:
    0 4px 0 0 #0a0206,
    0 5px 10px rgba(0, 0, 0, 0.4);
  opacity: 0.6;
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
@keyframes hm-draw-part {
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes hm-face-appear {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes hm-tile-pop {
  0% {
    transform: scale(0.88) translateY(3px);
  }
  55% {
    transform: scale(1.06) translateY(-1px);
  }
  100% {
    transform: scale(1) translateY(0);
  }
}

@keyframes hm-chip-pop {
  0% {
    transform: scale(0.78);
  }
  65% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes hm-key-press {
  0% {
    transform: translateY(4px);
    box-shadow:
      0 0 0 0 var(--hm-key-depth),
      0 1px 4px rgba(0, 0, 0, 0.35);
  }
  60% {
    transform: translateY(-1px);
  }
  100% {
    transform: translateY(0);
  }
}

@keyframes hm-pip-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.5);
  }
  100% {
    box-shadow: 0 0 0 6px rgba(244, 63, 94, 0);
  }
}

@keyframes hm-feedback-in {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.94);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes hm-waiting-bounce {
  0%,
  80%,
  100% {
    transform: scale(0.7);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

/* ── Reduced motion ──────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .hm-part--active,
  .hm-tile--fresh,
  .hm-chip--fresh,
  .hm-key--fresh,
  .hm-feedback,
  .hm-lives__pip--last,
  .hm-waiting__dot,
  .hm-face-dead {
    animation: none;
  }

  .hm-part {
    stroke-dasharray: none;
    stroke-dashoffset: 0;
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

[data-theme='light'] .hm-type-guess {
  background: linear-gradient(180deg, #ffffff 0%, #f4f2fc 100%);
  border-color: rgba(0, 0, 0, 0.14);
  color: var(--hm-text);
}

[data-theme='light'] .hm-type-guess:hover:not(.hm-type-guess--disabled) {
  border-color: rgba(109, 40, 217, 0.35);
}

[data-theme='light'] .hm-type-guess--focused {
  border-color: rgba(109, 40, 217, 0.55);
  box-shadow: 0 0 0 2px rgba(109, 40, 217, 0.12);
}

[data-theme='light'] .hm-type-guess__hint {
  color: var(--hm-text-muted);
}

[data-theme='light'] .hm-key {
  background: linear-gradient(180deg, #f0eeff 0%, #e4e0f8 100%);
  color: #2a2548;
  border-color: rgba(0, 0, 0, 0.14);
  box-shadow:
    0 4px 0 0 var(--hm-key-depth),
    0 5px 10px rgba(0, 0, 0, 0.1);
}

[data-theme='light'] .hm-key:hover:not(:disabled) {
  background: linear-gradient(180deg, #ffffff 0%, #ece8ff 100%);
}

[data-theme='light'] .hm-key--hit {
  background: linear-gradient(180deg, #d1fae5 0%, #a7f3d0 100%);
  border-color: rgba(16, 185, 129, 0.4);
  color: #065f46;
  box-shadow:
    0 4px 0 0 #6ee7b7,
    0 5px 10px rgba(16, 185, 129, 0.15);
}

[data-theme='light'] .hm-key--miss {
  background: linear-gradient(180deg, #fee2e2 0%, #fecaca 100%);
  border-color: rgba(244, 63, 94, 0.3);
  color: rgba(159, 18, 57, 0.5);
  box-shadow:
    0 4px 0 0 #fca5a5,
    0 5px 10px rgba(244, 63, 94, 0.1);
}

[data-theme='light'] .hm-chip--hit {
  color: #065f46;
}
[data-theme='light'] .hm-chip--miss {
  color: #9f1239;
}

[data-theme='light'] .hm-tile--lit {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.15);
  color: #1a1630;
}

[data-theme='light'] .hm-tile--blank {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.1);
  border-bottom-color: rgba(0, 0, 0, 0.25);
}
</style>
