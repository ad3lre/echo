<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import '@/features/voice/ticTacToe/tic-tac-toe-activity.css';
import type {
  EchoTicTacToeActivityV1,
  EchoTicTacToeInviteV1,
} from '@/audio/voiceEchoLiveKitData';
import {
  EMPTY_BOARD,
  applyMoveIfLegal,
  cpuDifficultyLabel,
  moveForAi,
  pickRandomCpuDifficulty,
  terminalFromBoard,
  winningLineIndices,
  type TttCell,
  type TttCpuDifficulty,
} from '@/features/voice/ticTacToe/ticTacToeCore';
import {
  playTicTacToeSfx,
  triggerTicTacToeHaptic,
} from '@/features/voice/ticTacToe/ticTacToeFeedback';

type SurfaceMode = 'hub' | 'cpu' | 'pvp';

const props = defineProps<{
  currentUserId: string;
  liveKitConnected: boolean;
  /** Voice roster + names for challenge list */
  voiceParticipants: readonly {
    id: string;
    name: string;
    pfp?: string;
    activityPresence?: readonly string[];
  }[];
  pvpActivity: EchoTicTacToeActivityV1 | null;
  pendingInvite: EchoTicTacToeInviteV1 | null;
  sendChallenge: (toUserId: string) => void;
  respondInvite: (accept: boolean) => void;
  dismissInvite: () => void;
  requestMove: (cellIndex: number) => void;
  requestRematch: () => void;
}>();

const surfaceMode = ref<SurfaceMode>('hub');
const cpuBoard = ref<TttCell[]>([...EMPTY_BOARD]);
const cpuTurn = ref<'X' | 'O'>('X');
const cpuStatus = ref<'playing' | 'draw' | 'x_wins' | 'o_wins'>('playing');
const cpuRoundId = ref(0);
const cpuDifficulty = ref<TttCpuDifficulty>(pickRandomCpuDifficulty());

/** Board snapshot for move detection (SFX / haptics / land VFX). */
const prevCells = ref<TttCell[]>([...EMPTY_BOARD]);
const landCellIndex = ref<number | null>(null);
let landClearTimer: ReturnType<typeof setTimeout> | null = null;
let outcomeDelayTimer: ReturnType<typeof setTimeout> | null = null;
const lastOutcomeKey = ref('');
const lastInviteSoundKey = ref('');

const humanMark: 'X' | 'O' = 'X';
const aiMark: 'X' | 'O' = 'O';

function countMarks(b: readonly TttCell[]): number {
  return b.filter(Boolean).length;
}

function findNewlyFilled(
  prev: readonly TttCell[],
  next: readonly TttCell[],
): { i: number; mark: 'X' | 'O' } | null {
  for (let i = 0; i < 9; i++) {
    const c = next[i];
    if (!prev[i] && (c === 'X' || c === 'O')) return { i, mark: c };
  }
  return null;
}

function clearLandTimer(): void {
  if (landClearTimer != null) {
    clearTimeout(landClearTimer);
    landClearTimer = null;
  }
}

function clearOutcomeTimer(): void {
  if (outcomeDelayTimer != null) {
    clearTimeout(outcomeDelayTimer);
    outcomeDelayTimer = null;
  }
}

function resetCpuGame(): void {
  cpuRoundId.value += 1;
  cpuBoard.value = [...EMPTY_BOARD];
  cpuTurn.value = 'X';
  cpuStatus.value = 'playing';
  cpuDifficulty.value = pickRandomCpuDifficulty();
}

watch(surfaceMode, (m, prevM) => {
  clearLandTimer();
  landCellIndex.value = null;
  lastOutcomeKey.value = '';
  clearOutcomeTimer();
  if (m === 'hub') {
    prevCells.value = [...EMPTY_BOARD];
  } else if (m !== prevM) {
    void nextTick(() => {
      prevCells.value = [...displayBoard.value];
    });
  }
  if (m === 'cpu') resetCpuGame();
});

watch(
  () => props.pvpActivity,
  (act) => {
    if (act && surfaceMode.value === 'hub') surfaceMode.value = 'pvp';
  },
);

const pvpChallengersInActivity = computed(() => {
  const self = props.currentUserId.trim();
  return props.voiceParticipants.filter((p) => {
    const id = p.id.trim();
    if (!id || id === self) return false;
    return (p.activityPresence ?? []).includes('tic_tac_toe');
  });
});

const displayBoard = computed((): TttCell[] => {
  if (surfaceMode.value === 'cpu') return cpuBoard.value;
  if (surfaceMode.value === 'pvp' && props.pvpActivity)
    return [...props.pvpActivity.board] as TttCell[];
  return [...EMPTY_BOARD];
});

const winCells = computed(() => {
  const b = displayBoard.value;
  const idx = winningLineIndices(b);
  return idx ? new Set(idx) : null;
});

const showBoardFinale = computed(() => {
  if (surfaceMode.value === 'cpu') return cpuStatus.value !== 'playing';
  const act = props.pvpActivity;
  return !!(act && act.status !== 'playing');
});

watch(
  displayBoard,
  (board) => {
    if (surfaceMode.value === 'hub') return;
    const prev = prevCells.value;
    const pm = countMarks(prev);
    const nm = countMarks(board);

    if (nm === 0 && pm > 0) {
      prevCells.value = [...board];
      return;
    }

    if (nm !== pm + 1) {
      prevCells.value = [...board];
      return;
    }

    const novelty = findNewlyFilled(prev, board);
    prevCells.value = [...board];
    if (!novelty) return;

    clearLandTimer();
    landCellIndex.value = novelty.i;
    landClearTimer = setTimeout(() => {
      landCellIndex.value = null;
      landClearTimer = null;
    }, 460);

    playTicTacToeSfx(novelty.mark === 'X' ? 'placeX' : 'placeO');

    if (surfaceMode.value === 'cpu') {
      triggerTicTacToeHaptic(novelty.mark === humanMark ? 'place' : 'opp');
    } else {
      const mine = myMarkInPvp();
      triggerTicTacToeHaptic(mine && novelty.mark === mine ? 'place' : 'opp');
    }
  },
  { deep: true },
);

watch(
  () => {
    if (surfaceMode.value === 'cpu') {
      if (cpuStatus.value === 'playing') return null;
      return `cpu:${cpuRoundId.value}:${cpuStatus.value}` as const;
    }
    const act = props.pvpActivity;
    if (surfaceMode.value === 'pvp' && act && act.status !== 'playing') {
      return `pvp:${act.matchId}:${act.revision}:${act.status}` as const;
    }
    return null;
  },
  (key) => {
    clearOutcomeTimer();
    if (!key) {
      lastOutcomeKey.value = '';
      return;
    }
    if (key === lastOutcomeKey.value) return;
    lastOutcomeKey.value = key;

    outcomeDelayTimer = setTimeout(() => {
      outcomeDelayTimer = null;

      if (surfaceMode.value === 'cpu') {
        if (cpuStatus.value === 'draw') {
          playTicTacToeSfx('draw');
          triggerTicTacToeHaptic('draw');
        } else if (cpuStatus.value === 'x_wins') {
          playTicTacToeSfx('win');
          triggerTicTacToeHaptic('win');
        } else if (cpuStatus.value === 'o_wins') {
          playTicTacToeSfx('lose');
          triggerTicTacToeHaptic('lose');
        }
        return;
      }

      const act = props.pvpActivity;
      if (!act || act.status === 'playing') return;
      const self = props.currentUserId.trim();
      const mine: 'X' | 'O' | null =
        act.xUserId.trim() === self
          ? 'X'
          : act.oUserId.trim() === self
            ? 'O'
            : null;

      if (act.status === 'draw') {
        playTicTacToeSfx('draw');
        triggerTicTacToeHaptic('draw');
        return;
      }

      const winner: 'X' | 'O' | null =
        act.status === 'x_wins' ? 'X' : act.status === 'o_wins' ? 'O' : null;
      if (!winner || !mine) {
        playTicTacToeSfx('draw');
        return;
      }
      if (winner === mine) {
        playTicTacToeSfx('win');
        triggerTicTacToeHaptic('win');
      } else {
        playTicTacToeSfx('lose');
        triggerTicTacToeHaptic('lose');
      }
    }, 88);
  },
);

watch(
  () => props.pendingInvite,
  (inv) => {
    if (!inv) {
      lastInviteSoundKey.value = '';
      return;
    }
    if (inv.toUserId.trim() !== props.currentUserId.trim()) return;
    const sig = inv.inviteId;
    if (sig === lastInviteSoundKey.value) return;
    lastInviteSoundKey.value = sig;
    playTicTacToeSfx('ping');
    triggerTicTacToeHaptic('invite');
  },
);

onUnmounted(() => {
  clearLandTimer();
  clearOutcomeTimer();
});

const statusLine = computed(() => {
  if (surfaceMode.value === 'cpu') {
    if (cpuStatus.value === 'draw') return 'Draw.';
    if (cpuStatus.value === 'x_wins') return 'You win.';
    if (cpuStatus.value === 'o_wins') return 'Echo wins.';
    return cpuTurn.value === humanMark ? 'Your move.' : 'Echo is thinking…';
  }
  const act = props.pvpActivity;
  if (!act) return 'Challenge someone in voice who has this activity open.';
  if (act.status === 'draw') return 'Draw.';
  if (act.status === 'x_wins') return `${nameFor(act.xUserId)} (X) wins.`;
  if (act.status === 'o_wins') return `${nameFor(act.oUserId)} (O) wins.`;
  const self = props.currentUserId.trim();
  const mark = act.currentTurn;
  const uid = mark === 'X' ? act.xUserId : act.oUserId;
  return uid.trim() === self
    ? `Your turn (${mark}).`
    : `Waiting for ${nameFor(uid)} (${mark}).`;
});

function nameFor(userId: string): string {
  const id = userId.trim();
  const row = props.voiceParticipants.find((p) => p.id.trim() === id);
  return row?.name?.trim() || 'Player';
}

function myMarkInPvp(): 'X' | 'O' | null {
  const act = props.pvpActivity;
  if (!act) return null;
  const self = props.currentUserId.trim();
  if (act.xUserId.trim() === self) return 'X';
  if (act.oUserId.trim() === self) return 'O';
  return null;
}

function onCpuCell(i: number): void {
  if (surfaceMode.value !== 'cpu') return;
  if (cpuStatus.value !== 'playing' || cpuTurn.value !== humanMark) return;
  const next = applyMoveIfLegal(cpuBoard.value, i, humanMark);
  if (!next) return;
  cpuBoard.value = next;
  const t = terminalFromBoard(next);
  if (t === 'playing') {
    cpuTurn.value = aiMark;
    queueMicrotask(() => playCpuReply());
  } else if (t === 'draw') cpuStatus.value = 'draw';
  else if (t === 'x_wins') cpuStatus.value = 'x_wins';
  else if (t === 'o_wins') cpuStatus.value = 'o_wins';
}

function playCpuReply(): void {
  const pick = moveForAi(cpuBoard.value, aiMark, cpuDifficulty.value);
  if (pick == null) return;
  const next = applyMoveIfLegal(cpuBoard.value, pick, aiMark);
  if (!next) return;
  cpuBoard.value = next;
  const t = terminalFromBoard(next);
  if (t === 'playing') cpuTurn.value = humanMark;
  else if (t === 'draw') cpuStatus.value = 'draw';
  else if (t === 'x_wins') cpuStatus.value = 'x_wins';
  else if (t === 'o_wins') cpuStatus.value = 'o_wins';
}

function onPvpCell(i: number): void {
  if (surfaceMode.value !== 'pvp') return;
  const act = props.pvpActivity;
  if (!act || act.status !== 'playing' || !props.liveKitConnected) return;
  const self = props.currentUserId.trim();
  const mark = act.currentTurn;
  const expected = mark === 'X' ? act.xUserId.trim() : act.oUserId.trim();
  if (self !== expected) return;
  props.requestMove(i);
}

function onCellClick(i: number): void {
  if (surfaceMode.value === 'cpu') onCpuCell(i);
  else onPvpCell(i);
}

function cellDisabled(i: number): boolean {
  const b = displayBoard.value;
  if (b[i]) return true;
  if (surfaceMode.value === 'cpu') {
    return cpuStatus.value !== 'playing' || cpuTurn.value !== humanMark;
  }
  const act = props.pvpActivity;
  if (!act || act.status !== 'playing' || !props.liveKitConnected) return true;
  const self = props.currentUserId.trim();
  const mark = act.currentTurn;
  const expected = mark === 'X' ? act.xUserId.trim() : act.oUserId.trim();
  return self !== expected;
}

function cellClass(i: number): string[] {
  const v = displayBoard.value[i];
  const cls = ['ttt-cell'];
  if (v) cls.push('ttt-filled', v === 'X' ? 'ttt-cell--x' : 'ttt-cell--o');
  if (winCells.value?.has(i)) cls.push('ttt-cell--win');
  if (landCellIndex.value === i) cls.push('ttt-cell--land');
  return cls;
}

function goHub(): void {
  surfaceMode.value = 'hub';
}

function onChallenge(peerId: string): void {
  playTicTacToeSfx('ping');
  triggerTicTacToeHaptic('place');
  props.sendChallenge(peerId);
}

function onRespondInvite(accept: boolean): void {
  if (accept) {
    playTicTacToeSfx('ping');
    triggerTicTacToeHaptic('place');
  } else {
    playTicTacToeSfx('deny');
    triggerTicTacToeHaptic('opp');
  }
  props.respondInvite(accept);
}

function onRematch(): void {
  playTicTacToeSfx('ping');
  triggerTicTacToeHaptic('place');
  props.requestRematch();
}

function onCpuPlayAgain(): void {
  playTicTacToeSfx('ping');
  triggerTicTacToeHaptic('place');
  resetCpuGame();
}

const inviteFromName = computed(() =>
  props.pendingInvite ? nameFor(props.pendingInvite.fromUserId) : '',
);
</script>

<template>
  <div class="ttt-root" aria-label="Echo Tic Tac Toe activity">
    <div class="ttt-shell">
      <header class="ttt-hero">
        <p class="ttt-eyebrow">Voice activity</p>
        <h1 class="ttt-title">Tic Tac Echo</h1>
        <p class="ttt-sub">
          Play against Echo’s engine, or challenge anyone else in this voice
          session who has the activity open — synced over your call.
        </p>
      </header>

      <div
        v-if="pendingInvite"
        :key="pendingInvite.inviteId"
        class="ttt-invite-banner ttt-invite-banner--pulse"
        role="status"
        aria-live="polite"
      >
        <div>
          <strong>{{ inviteFromName }}</strong>
          challenged you to a match (you play O).
        </div>
        <div class="tts-row-actions ttt-row-actions">
          <button
            type="button"
            class="ttt-btn ttt-btn--primary"
            @click="onRespondInvite(true)"
          >
            Accept
          </button>
          <button type="button" class="ttt-btn" @click="onRespondInvite(false)">
            Decline
          </button>
          <button
            type="button"
            class="ttt-btn ttt-btn--ghost"
            @click="dismissInvite"
          >
            Dismiss
          </button>
        </div>
      </div>

      <section v-if="surfaceMode === 'hub'" class="ttt-panel">
        <div class="ttt-modes">
          <button
            type="button"
            class="ttt-mode-card"
            @click="surfaceMode = 'cpu'"
          >
            <h3>Play Echo</h3>
            <p>
              Practice against Echo — difficulty shifts each round, private to
              you in this activity.
            </p>
          </button>
          <button
            type="button"
            class="ttt-mode-card"
            :disabled="!liveKitConnected"
            @click="surfaceMode = 'pvp'"
          >
            <h3>Challenge in voice</h3>
            <p>
              {{
                liveKitConnected
                  ? 'Pick someone else in this channel who has Tic Tac Echo open.'
                  : 'Join the voice channel to challenge others.'
              }}
            </p>
          </button>
        </div>
      </section>

      <section v-else class="ttt-panel">
        <div class="ttt-meta">
          <span>
            <template v-if="surfaceMode === 'cpu'">
              You · <b>X</b> vs Echo · <b>O</b> ({{
                cpuDifficultyLabel(cpuDifficulty)
              }})
            </template>
            <template v-else-if="pvpActivity">
              <b>{{ nameFor(pvpActivity.xUserId) }}</b> (X) vs
              <b>{{ nameFor(pvpActivity.oUserId) }}</b> (O)
              <template v-if="myMarkInPvp()">
                — you are <b>{{ myMarkInPvp() }}</b></template
              >
            </template>
            <template v-else> Pick an opponent to start. </template>
          </span>
          <div class="ttt-row-actions">
            <button type="button" class="ttt-btn ttt-btn--ghost" @click="goHub">
              Modes
            </button>
            <button
              v-if="surfaceMode === 'cpu' && cpuStatus !== 'playing'"
              type="button"
              class="ttt-btn ttt-btn--primary"
              @click="resetCpuGame"
            >
              Play again
            </button>
            <button
              v-if="
                surfaceMode === 'pvp' &&
                pvpActivity &&
                pvpActivity.status !== 'playing'
              "
              type="button"
              class="ttt-btn ttt-btn--primary"
              :disabled="!liveKitConnected"
              @click="requestRematch"
            >
              Rematch
            </button>
          </div>
        </div>

        <p class="ttt-meta" style="margin: 0.25rem 0 0">
          {{ statusLine }}
        </p>

        <div v-if="surfaceMode === 'pvp' && !pvpActivity" class="ttt-roster">
          <p v-if="!liveKitConnected" class="ttt-foot" style="text-align: left">
            Connect to voice to send invites.
          </p>
          <template v-else-if="pvpChallengersInActivity.length">
            <div
              v-for="p in pvpChallengersInActivity"
              :key="p.id"
              class="ttt-roster-row"
            >
              <span>{{ p.name }}</span>
              <button
                type="button"
                class="ttt-btn ttt-btn--primary"
                @click="onChallenge(p.id)"
              >
                Challenge
              </button>
            </div>
          </template>
          <p v-else class="ttt-foot" style="text-align: left">
            No one else in this channel has Tic Tac Echo open yet — ask them to
            open Activities → Tic Tac Echo.
          </p>
        </div>

        <div
          class="ttt-board-wrap"
          :class="{ 'ttt-board-wrap--finale': showBoardFinale }"
        >
          <div class="ttt-board" role="grid" aria-label="Tic tac toe board">
            <button
              v-for="i in 9"
              :key="i - 1"
              type="button"
              :class="cellClass(i - 1)"
              :disabled="cellDisabled(i - 1)"
              :aria-label="`Cell ${i}`"
              @click="onCellClick(i - 1)"
            >
              {{ displayBoard[i - 1] }}
            </button>
          </div>
        </div>
      </section>

      <p class="ttt-foot">
        X always opens. Voice matches are verified by the roster arbiter so both
        clients stay in sync.
      </p>
    </div>
  </div>
</template>
