<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
  EchoCodenamesActivityV1,
  EchoCodenamesAffiliationV1,
  EchoCodenamesRoleAssignmentV1,
} from '@/audio/voiceEchoLiveKitData';
import { hangmanOrchestratorUserId } from '@/features/voice/vcHangmanReducer';

const props = defineProps<{
  currentUserId?: string | null;
  activeVoiceChannelParticipants: readonly { id: string; name: string; pfp?: string }[];
  vcCodenamesActivity: EchoCodenamesActivityV1 | null;
  codenamesRosterUserIds: readonly string[];
  vcCodenamesSpymasterKey: EchoCodenamesAffiliationV1[] | null;
  commitVcCodenamesDeal: () => string | null;
  requestVcCodenamesSetup: (
    assignments: EchoCodenamesRoleAssignmentV1[],
  ) => void;
  requestVcCodenamesClue: (word: string, number: number) => void;
  requestVcCodenamesReveal: (cardIndex: number) => void;
  requestVcCodenamesEndTurn: () => void;
  requestVcCodenamesNewGame: () => void;
  requestVcCodenamesPushKeyToOrchestrator: () => void;
}>();

const setupError = ref('');
const dealError = ref('');
const clueWord = ref('');
const clueNumber = ref(1);

function displayNameFor(userId: string): string {
  const row = props.activeVoiceChannelParticipants.find((p) => p.id === userId);
  return row?.name?.trim() || userId;
}

const orchId = computed(() =>
  hangmanOrchestratorUserId([...props.codenamesRosterUserIds]),
);

const isOrchestrator = computed(() => {
  const self = props.currentUserId?.trim();
  return !!(self && orchId.value && self === orchId.value);
});

const act = computed(() => props.vcCodenamesActivity);

const myRole = computed(() => {
  const self = props.currentUserId?.trim();
  if (!self || !act.value) return null;
  return act.value.roleAssignments.find((r) => r.userId === self) ?? null;
});

const canSeeSpymasterKey = computed(
  () =>
    !!props.vcCodenamesSpymasterKey?.length &&
    myRole.value?.role === 'spymaster',
);

function buildSuggestedRoles(
  roster: readonly string[],
): EchoCodenamesRoleAssignmentV1[] {
  const sorted = [...roster].sort((a, b) => a.localeCompare(b));
  if (sorted.length < 4) return [];
  const [a, b, c, d, ...rest] = sorted;
  const out: EchoCodenamesRoleAssignmentV1[] = [
    { userId: a!, team: 'red', role: 'spymaster' },
    { userId: b!, team: 'blue', role: 'spymaster' },
    { userId: c!, team: 'red', role: 'operative' },
    { userId: d!, team: 'blue', role: 'operative' },
  ];
  rest.forEach((uid, i) => {
    out.push({
      userId: uid,
      team: i % 2 === 0 ? 'red' : 'blue',
      role: 'operative',
    });
  });
  return out;
}

function applySuggestedTeams(): void {
  setupError.value = '';
  const r = buildSuggestedRoles(props.codenamesRosterUserIds);
  if (!r.length) {
    setupError.value = 'Need at least four people in this activity to play.';
    return;
  }
  props.requestVcCodenamesSetup(r);
}

function onDeal(): void {
  dealError.value = '';
  const err = props.commitVcCodenamesDeal();
  if (err) dealError.value = err;
}

function onClueSubmit(): void {
  props.requestVcCodenamesClue(clueWord.value.trim(), Math.floor(clueNumber.value));
  clueWord.value = '';
}

function cardStyle(
  cell: EchoCodenamesActivityV1['cells'][0],
  index: number,
): Record<string, string> {
  if (cell.revealed) {
    const a = cell.affiliation;
    const bg =
      a === 'red'
        ? 'rgba(220, 38, 38, 0.35)'
        : a === 'blue'
          ? 'rgba(37, 99, 235, 0.35)'
          : a === 'assassin'
            ? 'rgba(24, 24, 27, 0.85)'
            : 'rgba(113, 113, 122, 0.35)';
    return { backgroundColor: bg };
  }
  if (canSeeSpymasterKey.value && props.vcCodenamesSpymasterKey) {
    const k = props.vcCodenamesSpymasterKey[index];
    const border =
      k === 'red'
        ? '2px solid rgba(220,38,38,0.9)'
        : k === 'blue'
          ? '2px solid rgba(37,99,235,0.9)'
          : k === 'assassin'
            ? '2px solid rgba(0,0,0,0.85)'
            : '1px solid rgba(161,161,170,0.6)';
    return { border };
  }
  return {};
}

const canGuess = computed(() => {
  const a = act.value;
  if (!a || a.phase !== 'playing' || a.turnStage !== 'await_guess') return false;
  if (myRole.value?.role !== 'operative') return false;
  return myRole.value.team === a.currentTeam;
});

const canClue = computed(() => {
  const a = act.value;
  if (!a || a.phase !== 'playing' || a.turnStage !== 'await_clue') return false;
  if (myRole.value?.role !== 'spymaster') return false;
  return myRole.value.team === a.currentTeam;
});
</script>

<template>
  <div
    class="custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-auto px-4 py-5"
  >
    <div
      class="relative overflow-hidden rounded-2xl border border-border bg-elevated px-4 py-4 sm:px-5 sm:py-5"
      role="banner"
      aria-label="Echoed Names"
    >
      <div
        class="pointer-events-none absolute inset-0 opacity-90"
        aria-hidden="true"
        style="
          background:
            radial-gradient(90% 120% at 0% 0%, rgba(56, 189, 248, 0.12) 0%, transparent 50%),
            radial-gradient(80% 100% at 100% 100%, rgba(167, 139, 250, 0.1) 0%, transparent 48%),
            linear-gradient(165deg, color-mix(in srgb, var(--elevated) 88%, #0a1220) 0%, var(--elevated) 100%);
        "
      />
      <div class="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold tracking-tight text-fg">Echoed Names</h2>
          <p class="mt-0.5 text-sm text-fg-soft">
            Team word grid · session host applies moves from everyone in voice
          </p>
        </div>
        <div
          v-if="act?.phase === 'playing' && !isOrchestrator"
          class="rounded-lg border border-border bg-bg/60 px-3 py-2 text-xs text-fg-soft backdrop-blur-sm"
        >
          Session host:
          <span class="font-medium text-fg">{{ displayNameFor(orchId || '') }}</span>
        </div>
      </div>
    </div>

    <div
      v-if="!act"
      class="rounded-2xl border border-border bg-elevated px-5 py-8 text-center text-sm text-fg-soft"
    >
      <p>Waiting for the session host to open the lobby…</p>
      <p class="mt-2 text-xs text-fg-subtle">
        Only the session host needs this activity open to start; you still need four people in
        the activity to assign teams and deal, like the tabletop game.
      </p>
    </div>

    <template v-else>
      <div
        v-if="act.phase === 'lobby'"
        class="space-y-4 rounded-2xl border border-border bg-elevated p-5"
      >
        <p class="text-sm text-fg-soft">
          {{ codenamesRosterUserIds.length }} players in this activity
          <span v-if="codenamesRosterUserIds.length < 4" class="text-amber-600">
            · need at least 4</span>
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-fg disabled:opacity-40"
            :disabled="codenamesRosterUserIds.length < 4 || !isOrchestrator"
            @click="applySuggestedTeams"
          >
            Use suggested teams
          </button>
          <button
            type="button"
            class="rounded-xl border border-border px-4 py-2 text-sm font-medium text-fg disabled:opacity-40"
            :disabled="!act.roleAssignments.length || !isOrchestrator"
            @click="onDeal"
          >
            Deal board
          </button>
        </div>
        <p v-if="setupError" class="text-sm text-red-600">{{ setupError }}</p>
        <p v-if="dealError" class="text-sm text-red-600">{{ dealError }}</p>
        <ul v-if="act.roleAssignments.length" class="text-sm text-fg-soft">
          <li v-for="r in act.roleAssignments" :key="r.userId">
            <span class="font-medium text-fg">{{ displayNameFor(r.userId) }}</span>
            · {{ r.team }} {{ r.role }}
          </li>
        </ul>
      </div>

      <div
        v-else-if="act.phase === 'paused_requires_new_game'"
        class="rounded-2xl border border-amber-600/40 bg-elevated p-6 text-center"
      >
        <p class="font-medium text-fg">Board key was lost</p>
        <p class="mt-2 text-sm text-fg-soft">Start a new round to continue.</p>
        <button
          type="button"
          class="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
          @click="requestVcCodenamesNewGame()"
        >
          New game
        </button>
      </div>

      <div
        v-else-if="act.phase === 'game_over'"
        class="rounded-2xl border border-border bg-elevated p-6 text-center"
      >
        <p class="text-lg font-semibold text-fg">
          {{ act.winner === 'red' ? 'Red' : 'Blue' }} wins
        </p>
        <button
          type="button"
          class="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
          @click="requestVcCodenamesNewGame()"
        >
          Play again
        </button>
      </div>

      <template v-else-if="act.phase === 'playing'">
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <span
            class="rounded-full px-3 py-1 font-medium"
            :class="
              act.currentTeam === 'red'
                ? 'bg-red-500/20 text-red-700 dark:text-red-300'
                : 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
            "
          >
            {{ act.currentTeam === 'red' ? 'Red' : 'Blue' }} turn
          </span>
          <span v-if="act.turnStage === 'await_guess'" class="text-fg-soft">
            Guesses left: {{ act.guessesRemaining }}
          </span>
          <span v-if="act.currentClue" class="text-fg-soft">
            Clue: {{ act.currentClue.word }} · {{ act.currentClue.number }}
          </span>
        </div>

        <div
          class="grid max-w-3xl grid-cols-5 gap-2 sm:gap-3"
          style="grid-template-columns: repeat(5, minmax(0, 1fr))"
        >
          <button
            v-for="(cell, i) in act.cells"
            :key="i"
            type="button"
            class="flex min-h-[3.5rem] flex-col items-center justify-center rounded-xl border border-border bg-bg px-1 py-2 text-center text-[11px] font-semibold uppercase leading-tight text-fg transition hover:bg-elevated sm:min-h-[4rem] sm:text-xs"
            :style="cardStyle(cell, i)"
            :disabled="!canGuess || cell.revealed"
            @click="requestVcCodenamesReveal(i)"
          >
            {{ cell.word }}
          </button>
        </div>

        <div
          v-if="canClue"
          class="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-elevated p-4"
        >
          <label class="flex flex-col gap-1 text-xs font-medium text-fg-soft">
            Clue
            <input
              v-model="clueWord"
              class="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg"
              maxlength="64"
              autocomplete="off"
            />
          </label>
          <label class="flex flex-col gap-1 text-xs font-medium text-fg-soft">
            Number (0–9)
            <input
              v-model.number="clueNumber"
              type="number"
              min="0"
              max="9"
              class="w-20 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg"
            />
          </label>
          <button
            type="button"
            class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
            @click="onClueSubmit"
          >
            Give clue
          </button>
        </div>

        <div v-if="canGuess" class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-fg"
            @click="requestVcCodenamesEndTurn()"
          >
            End guessing
          </button>
        </div>

        <button
          v-if="act.phase === 'playing' && myRole?.role === 'spymaster' && !isOrchestrator"
          type="button"
          class="text-xs font-medium text-primary underline-offset-2 hover:underline"
          @click="requestVcCodenamesPushKeyToOrchestrator()"
        >
          Send key to session host
        </button>
      </template>
    </template>
  </div>
</template>
