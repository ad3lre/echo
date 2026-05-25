<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type {
  EchoSkrigglesActivityV1,
  EchoSkrigglesCanvasCmdV1,
  EchoSkrigglesCanvasSnapshotV1,
  EchoSkrigglesSettingsV1,
  EchoSkrigglesStrokeBatchV1,
} from '@/audio/voiceEchoLiveKitData';
import VcSkrigglesCanvas from '@/features/voice/skriggles/components/VcSkrigglesCanvas.vue';
import VcSkrigglesChat from '@/features/voice/skriggles/components/VcSkrigglesChat.vue';
import VcSkrigglesLobby from '@/features/voice/skriggles/components/VcSkrigglesLobby.vue';
import VcSkrigglesScoreboard from '@/features/voice/skriggles/components/VcSkrigglesScoreboard.vue';
import VcSkrigglesWordPicker from '@/features/voice/skriggles/components/VcSkrigglesWordPicker.vue';
import { useSkrigglesSfx } from '@/features/voice/skriggles/composables/useSkrigglesSfx';
import type { SkrigglesCanvasEvent } from '@/features/voice/skriggles/skrigglesVoiceSession';
import {
  mergeSkrigglesPresenceRoster,
  skrigglesOrchestratorUserId,
} from '@/features/voice/skriggles/vcSkrigglesReducer';
import { timeRemainingSec } from '@/features/voice/skriggles/vcSkrigglesScoring';

const props = defineProps<{
  currentUserId?: string;
  skrigglesActivity: EchoSkrigglesActivityV1 | null;
  skrigglesRosterUserIds: string[];
  voiceParticipants: readonly { id: string; name: string; pfp?: string }[];
  canvasEvents: readonly SkrigglesCanvasEvent[];
  commitWordChoice: (word: string) => void;
  submitGuess: (guess: string) => void;
  updateSettings: (settings: Partial<EchoSkrigglesSettingsV1>) => void;
  startGame: () => void;
  advanceRound: () => void;
  publishStrokeBatch: (batch: EchoSkrigglesStrokeBatchV1) => void;
  publishCanvasCmd: (cmd: EchoSkrigglesCanvasCmdV1) => void;
  publishCanvasSnapshot: (snapshot: EchoSkrigglesCanvasSnapshotV1) => void;
  tickTimers: () => void;
}>();

const { playSkrigglesSfx } = useSkrigglesSfx();

const statusLine = ref('');
const secondsLeft = ref(0);
const lastChatSfxKey = ref<string | null>(null);
const lastRoundEndSfxKey = ref<string | null>(null);
const lastTickSecond = ref<number>(-1);

let timerInterval: ReturnType<typeof setInterval> | null = null;

function uid(): string {
  return props.currentUserId?.trim() ?? '';
}

function displayNameFor(userId: string): string {
  const id = userId.trim();
  const row = props.voiceParticipants.find((p) => p.id === id);
  if (row?.name?.trim()) return row.name.trim();
  return id.slice(0, 8);
}

const act = computed(() => props.skrigglesActivity);
const phase = computed(() => act.value?.phase ?? null);

const mergedRoster = computed(() =>
  mergeSkrigglesPresenceRoster(
    act.value?.rosterUserIds ?? [],
    props.skrigglesRosterUserIds,
  ),
);

const orchestratorId = computed(
  () => skrigglesOrchestratorUserId(mergedRoster.value) ?? '',
);

const isOrchestrator = computed(() => {
  const me = uid();
  return !!(me && orchestratorId.value && me === orchestratorId.value);
});

const drawerId = computed(() => act.value?.drawerUserId.trim() ?? '');

const isDrawer = computed(() => {
  const me = uid();
  return !!(me && drawerId.value && me === drawerId.value);
});

const rosterLabel = computed(() =>
  props.skrigglesRosterUserIds.map((id) => displayNameFor(id)).join(' · '),
);

const wordHint = computed(() => act.value?.wordHint ?? '');

const canGuess = computed(() => {
  const st = act.value;
  const me = uid();
  if (!st || st.phase !== 'drawing' || !me) return false;
  if (me === st.drawerUserId.trim()) return false;
  if (st.correctGuessersThisRound.includes(me)) return false;
  return true;
});

const canDraw = computed(
  () => act.value?.phase === 'drawing' && isDrawer.value,
);

const drawerWordChoices = computed(() => {
  if (act.value?.phase !== 'word_pick' || !isDrawer.value) return null;
  return act.value.wordChoices;
});

function refreshCountdown(): void {
  const st = act.value;
  if (!st?.phaseEndsAt) {
    secondsLeft.value = 0;
    return;
  }
  const next = timeRemainingSec(st.phaseEndsAt);
  if (
    next !== secondsLeft.value &&
    next > 0 &&
    (st.phase === 'drawing' || st.phase === 'word_pick')
  ) {
    if (lastTickSecond.value >= 0 && next < lastTickSecond.value) {
      playSkrigglesSfx('tick');
    }
    lastTickSecond.value = next;
  }
  secondsLeft.value = next;
}

watch(
  act,
  (st) => {
    lastTickSecond.value = -1;
    if (!st) {
      statusLine.value =
        'Waiting for the voice room. Join voice and open Skriggles so everyone syncs to the same game.';
      return;
    }
    if (st.phase === 'lobby') {
      statusLine.value = isOrchestrator.value
        ? 'Configure settings and start when everyone is ready.'
        : 'Waiting for the roster host to start Skriggles.';
    } else if (st.phase === 'word_pick') {
      statusLine.value = isDrawer.value
        ? 'Pick one of your three words before time runs out.'
        : `${displayNameFor(st.drawerUserId)} is choosing a word…`;
    } else if (st.phase === 'drawing') {
      statusLine.value = isDrawer.value
        ? 'Draw the word — guessers see your strokes in real time.'
        : 'Guess what is being drawn!';
    } else if (st.phase === 'round_reveal') {
      statusLine.value = 'Round over — check the scores below.';
      const key = `${st.roundSeq}:round_reveal`;
      if (lastRoundEndSfxKey.value !== key) {
        lastRoundEndSfxKey.value = key;
        playSkrigglesSfx('round-end');
      }
    } else if (st.phase === 'game_over') {
      statusLine.value = 'Final standings — thanks for playing!';
      const key = 'game_over';
      if (lastRoundEndSfxKey.value !== key) {
        lastRoundEndSfxKey.value = key;
        playSkrigglesSfx('round-end');
      }
    }
    refreshCountdown();
  },
  { immediate: true, deep: true },
);

watch(
  () => act.value?.chatLog.length,
  () => {
    const st = act.value;
    if (!st?.chatLog.length) return;
    const entry = st.chatLog[st.chatLog.length - 1]!;
    const key = `${entry.at}:${entry.kind}:${entry.userId}:${entry.text}`;
    if (lastChatSfxKey.value === key) return;
    lastChatSfxKey.value = key;
    if (entry.kind === 'correct') playSkrigglesSfx('correct');
    if (entry.kind === 'close') playSkrigglesSfx('close');
  },
);

onMounted(() => {
  timerInterval = setInterval(() => {
    props.tickTimers();
    refreshCountdown();
  }, 500);
});

onUnmounted(() => {
  if (timerInterval != null) clearInterval(timerInterval);
});
</script>

<template>
  <div class="sk-game" role="application" aria-label="Echo voice Skriggles">
    <header class="sk-header">
      <div class="sk-header__brand">
        <svg
          class="sk-header__icon"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 18 L8 6 L12 14 L16 8 L20 18"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle cx="7" cy="7" r="2.5" fill="currentColor" />
        </svg>
        <span class="sk-header__wordmark">Skriggles</span>
        <span class="sk-header__badge">Voice</span>
      </div>
      <div class="sk-header__right">
        <div v-if="skrigglesRosterUserIds.length" class="sk-players">
          <span class="sk-players__dot" aria-hidden="true" />
          <span class="sk-players__text">{{ rosterLabel }}</span>
        </div>
        <details class="sk-rules">
          <summary class="sk-rules__btn" aria-label="How to play">?</summary>
          <div class="sk-rules__panel">
            <p class="sk-rules__title">How it works</p>
            <ul class="sk-rules__list">
              <li>
                <strong>Drawer</strong> picks a word and draws on the canvas.
              </li>
              <li>
                <strong>Guessers</strong> type guesses in chat — close guesses
                get a hint.
              </li>
              <li>
                <strong>Points</strong> scale with how fast you guess and how
                many are left.
              </li>
              <li>
                <strong>Turns</strong> rotate round-robin through the roster.
              </li>
            </ul>
          </div>
        </details>
      </div>
    </header>

    <div
      class="sk-hud"
      :class="{
        'sk-hud--urgent': secondsLeft > 0 && secondsLeft <= 10,
      }"
    >
      <p class="sk-hud__msg">{{ statusLine }}</p>
      <div v-if="secondsLeft > 0" class="sk-hud__timer" role="timer">
        {{ secondsLeft }}s
      </div>
    </div>

    <div v-if="!act" class="sk-empty">
      <p class="sk-empty__title">Waiting for the game</p>
      <p class="sk-empty__body">
        Join a voice channel and open Skriggles so Echo can sync everyone to the
        same round.
      </p>
    </div>

    <template v-else>
      <VcSkrigglesLobby
        v-if="act.phase === 'lobby'"
        :activity="act"
        :roster-user-ids="skrigglesRosterUserIds"
        :voice-participants="voiceParticipants"
        :is-orchestrator="isOrchestrator"
        :update-settings="updateSettings"
        :start-game="startGame"
        :display-name-for="displayNameFor"
      />

      <VcSkrigglesWordPicker
        v-else-if="act.phase === 'word_pick'"
        :word-choices="drawerWordChoices"
        :phase-ends-at="act.phaseEndsAt"
        :is-drawer="isDrawer"
        :drawer-display-name="displayNameFor(act.drawerUserId)"
        :commit-word-choice="commitWordChoice"
      />

      <div v-else-if="act.phase === 'drawing'" class="sk-arena">
        <div class="sk-arena__main">
          <p v-if="wordHint" class="sk-hint" aria-live="polite">
            {{ wordHint }}
          </p>
          <VcSkrigglesCanvas
            :round-seq="act.roundSeq"
            :canvas-events="canvasEvents"
            :can-draw="canDraw"
            :publish-stroke-batch="publishStrokeBatch"
            :publish-canvas-cmd="publishCanvasCmd"
            :publish-canvas-snapshot="publishCanvasSnapshot"
          />
        </div>
        <VcSkrigglesChat
          class="sk-arena__chat"
          :chat-log="act.chatLog"
          :can-guess="canGuess"
          :display-name-for="displayNameFor"
          :submit-guess="submitGuess"
        />
      </div>

      <div
        v-else-if="act.phase === 'round_reveal' || act.phase === 'game_over'"
        class="sk-reveal"
      >
        <VcSkrigglesCanvas
          v-if="act.phase === 'round_reveal'"
          :round-seq="act.roundSeq"
          :canvas-events="canvasEvents"
          :can-draw="false"
          :publish-stroke-batch="publishStrokeBatch"
          :publish-canvas-cmd="publishCanvasCmd"
          :publish-canvas-snapshot="publishCanvasSnapshot"
        />
        <VcSkrigglesScoreboard
          :activity="act"
          :roster-user-ids="skrigglesRosterUserIds"
          :voice-participants="voiceParticipants"
          :phase="act.phase === 'game_over' ? 'game_over' : 'round_reveal'"
          :is-orchestrator="isOrchestrator"
          :display-name-for="displayNameFor"
          :advance-round="advanceRound"
        />
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.sk-game {
  --sk-bg: #06040f;
  --sk-surface: #0d0b1e;
  --sk-border: rgba(255, 255, 255, 0.07);
  --sk-border-mid: rgba(255, 255, 255, 0.12);
  --sk-text: #ede8ff;
  --sk-text-soft: #9a93b8;
  --sk-text-muted: #4e4870;
  --sk-accent: #a78bfa;
  --sk-hit: #10b981;
  --sk-miss: #f43f5e;
  --sk-radius: 12px;

  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  background:
    radial-gradient(
      ellipse 80% 45% at 50% 0%,
      rgba(124, 58, 237, 0.07) 0%,
      transparent 65%
    ),
    radial-gradient(
      ellipse 60% 55% at 5% 100%,
      rgba(16, 185, 129, 0.05) 0%,
      transparent 60%
    ),
    var(--sk-bg);
  color: var(--sk-text);
  font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  padding-bottom: max(0.35rem, env(safe-area-inset-bottom, 0px));
}

.sk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--sk-border);
  background: rgba(255, 255, 255, 0.018);
  flex-shrink: 0;
}

.sk-header__brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.sk-header__icon {
  width: 1.35rem;
  height: 1.35rem;
  color: var(--sk-accent);
}

.sk-header__wordmark {
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.sk-header__badge {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--sk-text-muted);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--sk-border);
  border-radius: 4px;
  padding: 0.1rem 0.45rem;
}

.sk-header__right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.sk-players {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 14rem;
  overflow: hidden;
}

.sk-players__dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--sk-hit);
  flex-shrink: 0;
}

.sk-players__text {
  font-size: 0.72rem;
  color: var(--sk-text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sk-rules {
  position: relative;
}

.sk-rules__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  cursor: pointer;
  color: var(--sk-text-muted);
  list-style: none;
  font-size: 0.85rem;
  font-weight: 700;
}

.sk-rules__btn::-webkit-details-marker {
  display: none;
}

.sk-rules__panel {
  position: absolute;
  right: 0;
  top: calc(100% + 0.5rem);
  z-index: 30;
  width: 16rem;
  background: #1a1730;
  border: 1px solid var(--sk-border-mid);
  border-radius: 10px;
  padding: 1rem;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
}

.sk-rules__title {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--sk-accent);
  margin-bottom: 0.6rem;
}

.sk-rules__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;

  li {
    font-size: 0.78rem;
    line-height: 1.5;
    color: var(--sk-text-soft);
    padding-left: 1rem;
    position: relative;

    &::before {
      content: '·';
      position: absolute;
      left: 0;
      color: var(--sk-text-muted);
    }

    strong {
      color: var(--sk-text);
    }
  }
}

.sk-hud {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid var(--sk-border);
  background: rgba(255, 255, 255, 0.015);
  flex-shrink: 0;
}

.sk-hud--urgent {
  background: rgba(244, 63, 94, 0.05);
}

.sk-hud__msg {
  flex: 1;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--sk-text-soft);
  min-width: 0;
}

.sk-hud__timer {
  font-size: 0.9rem;
  font-weight: 900;
  font-family: var(--font-mono, ui-monospace, monospace);
  color: var(--sk-text);
  flex-shrink: 0;
}

.sk-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  padding: 2rem 1.5rem;
  text-align: center;
}

.sk-empty__title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--sk-text-soft);
}

.sk-empty__body {
  font-size: 0.82rem;
  color: var(--sk-text-muted);
  max-width: 22rem;
  line-height: 1.55;
}

.sk-arena {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  min-height: 0;
  flex: 1;

  @media (min-width: 760px) {
    flex-direction: row;
    align-items: stretch;
  }
}

.sk-arena__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.sk-arena__chat {
  min-width: 0;

  @media (min-width: 760px) {
    width: 16rem;
    max-width: 16rem;
    flex-shrink: 0;
  }
}

.sk-hint {
  margin: 0;
  text-align: center;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: clamp(0.95rem, 3vw, 1.2rem);
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--sk-text);
  padding: 0.45rem;
  border-radius: 8px;
  background: var(--sk-surface);
  border: 1px solid var(--sk-border);
}

.sk-reveal {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
}

[data-theme='light'] .sk-game {
  --sk-bg: #f4f2fc;
  --sk-surface: #ffffff;
  --sk-border: rgba(0, 0, 0, 0.08);
  --sk-border-mid: rgba(0, 0, 0, 0.13);
  --sk-text: #1a1630;
  --sk-text-soft: #5a5278;
  --sk-text-muted: #9990b8;
}
</style>
