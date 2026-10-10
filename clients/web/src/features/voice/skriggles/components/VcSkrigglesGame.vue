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
import { useSkrigglesSfx } from '@/features/voice/skriggles/useSkrigglesSfx';
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
  voiceChannelId?: string;
  gameRoomConnected?: boolean;
  gameRoomError?: string | null;
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

const emptyTitle = computed(() => {
  if (!props.voiceChannelId?.trim()) return 'Join voice to play';
  if (props.gameRoomError === 'not_configured') return 'Games unavailable';
  if (props.gameRoomError) return 'Could not connect to game';
  if (!props.gameRoomConnected) return 'Connecting to game…';
  return 'Starting round…';
});

const emptyBody = computed(() => {
  if (!props.voiceChannelId?.trim()) {
    return 'Join a voice channel and open Skriggles so Echo can sync everyone to the same round.';
  }
  if (props.gameRoomError === 'not_configured') {
    return 'The game server is not configured on this Echo instance. Ask an admin to set GAME_SERVER_PUBLIC_URL and run echo-game-server.';
  }
  if (props.gameRoomError) {
    return 'Echo could not reach the game server. Check that echo-game-server is running and reachable from your browser.';
  }
  if (!props.gameRoomConnected) {
    return 'Skriggles is syncing with the voice room. This usually takes a moment after you join voice.';
  }
  return 'Skriggles is loading the lobby from the game server.';
});

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
      if (!props.voiceChannelId?.trim()) {
        statusLine.value =
          'Waiting for the voice room. Join voice and open Skriggles so everyone syncs to the same game.';
      } else if (props.gameRoomError) {
        statusLine.value = 'Could not reach the game server.';
      } else if (!props.gameRoomConnected) {
        statusLine.value =
          'Skriggles is syncing with the game server. This usually takes a moment after you join voice.';
      } else {
        statusLine.value = 'Starting lobby…';
      }
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
      <p class="sk-empty__title">{{ emptyTitle }}</p>
      <p class="sk-empty__body">
        {{ emptyBody }}
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

<style scoped lang="scss" src="./styles/VcSkrigglesGame.scss"></style>
