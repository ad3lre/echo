<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
  EchoCodenamesActivityV1,
  EchoCodenamesAffiliationV1,
  EchoCodenamesPublicCellV1,
  EchoCodenamesRoleAssignmentV1,
} from '@/audio/voiceEchoLiveKitData';
import { hangmanOrchestratorUserId } from '@/features/voice/hangman/vcHangmanReducer';
import {
  buildSoloCodenamesRoles,
  codenamesMinPlayersToStart,
  isCodenamesSoloRoster,
  VC_CODENAMES_MIN_PLAYERS,
} from '@/features/voice/codenames/vcCodenamesReducer';

const props = defineProps<{
  currentUserId?: string | null;
  activeVoiceChannelParticipants: readonly {
    id: string;
    name: string;
    pfp?: string;
  }[];
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
  voiceChannelId?: string;
  gameRoomConnected?: boolean;
  gameRoomError?: string | null;
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

const emptyTitle = computed(() => {
  if (!props.voiceChannelId?.trim()) return 'Join voice to play';
  if (props.gameRoomError === 'not_configured') return 'Games unavailable';
  if (props.gameRoomError) return 'Could not connect to game';
  if (!props.gameRoomConnected) return 'Connecting to game…';
  return 'Starting session…';
});

const emptyBody = computed(() => {
  if (!props.voiceChannelId?.trim()) {
    return 'Join a voice channel and open Echoed Names so everyone syncs to the same lobby.';
  }
  if (props.gameRoomError === 'not_configured') {
    return 'The game server is not configured on this Echo instance. Ask an admin to set GAME_SERVER_PUBLIC_URL and run echo-game-server.';
  }
  if (props.gameRoomError) {
    return 'Echo could not reach the game server. Check that echo-game-server is running and reachable from your browser.';
  }
  if (!props.gameRoomConnected) {
    return 'Echoed Names is syncing with the voice room. This usually takes a moment after you join voice.';
  }
  return 'The lobby is loading from the game server.';
});

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

const minPlayers = codenamesMinPlayersToStart();

const isSoloRoster = computed(() =>
  isCodenamesSoloRoster(props.codenamesRosterUserIds),
);

function teamQuota(team: 'red' | 'blue', startingTeam: 'red' | 'blue'): number {
  return team === startingTeam ? 9 : 8;
}

function remainingTeamCards(
  cells: readonly EchoCodenamesPublicCellV1[],
  team: 'red' | 'blue',
  startingTeam: 'red' | 'blue',
): number {
  const quota = teamQuota(team, startingTeam);
  const revealed = cells.filter(
    (c) => c.revealed && c.affiliation === team,
  ).length;
  return Math.max(0, quota - revealed);
}

const teamCounts = computed(() => {
  const a = act.value;
  if (!a || a.phase !== 'playing') return null;
  return {
    red: remainingTeamCards(a.cells, 'red', a.startingTeam),
    blue: remainingTeamCards(a.cells, 'blue', a.startingTeam),
  };
});

function buildSuggestedRoles(
  roster: readonly string[],
): EchoCodenamesRoleAssignmentV1[] {
  const sorted = [...roster].sort((a, b) => a.localeCompare(b));
  if (sorted.length === 1) return buildSoloCodenamesRoles(sorted[0]!);
  if (sorted.length < VC_CODENAMES_MIN_PLAYERS) return [];
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
    setupError.value =
      props.codenamesRosterUserIds.length < minPlayers
        ? 'Need at least one person in this activity to play.'
        : `Need at least ${VC_CODENAMES_MIN_PLAYERS} people for suggested teams (or play solo with one person).`;
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
  props.requestVcCodenamesClue(
    clueWord.value.trim(),
    Math.floor(clueNumber.value),
  );
  clueWord.value = '';
}

type CardAffiliation = EchoCodenamesAffiliationV1 | 'hidden' | 'operative';

function cardAffiliation(
  cell: EchoCodenamesPublicCellV1,
  index: number,
): CardAffiliation {
  if (cell.revealed) return cell.affiliation ?? 'neutral';
  if (canSeeSpymasterKey.value && props.vcCodenamesSpymasterKey) {
    return props.vcCodenamesSpymasterKey[index] ?? 'neutral';
  }
  return 'operative';
}

function cardClass(
  cell: EchoCodenamesPublicCellV1,
  index: number,
): Record<string, boolean> {
  const aff = cardAffiliation(cell, index);
  return {
    'en-card': true,
    'en-card--revealed': cell.revealed,
    'en-card--pickable': canGuess.value && !cell.revealed,
    'en-card--aff-red': aff === 'red',
    'en-card--aff-blue': aff === 'blue',
    'en-card--aff-neutral': aff === 'neutral',
    'en-card--aff-assassin': aff === 'assassin',
    'en-card--aff-operative': aff === 'operative',
  };
}

const canGuess = computed(() => {
  const a = act.value;
  const self = props.currentUserId?.trim();
  if (!a || !self || a.phase !== 'playing' || a.turnStage !== 'await_guess')
    return false;
  if (isCodenamesSoloRoster(a.rosterUserIds))
    return a.roleAssignments.some((r) => r.userId === self);
  if (myRole.value?.role !== 'operative') return false;
  return myRole.value.team === a.currentTeam;
});

const canClue = computed(() => {
  const a = act.value;
  const self = props.currentUserId?.trim();
  if (!a || !self || a.phase !== 'playing' || a.turnStage !== 'await_clue')
    return false;
  if (isCodenamesSoloRoster(a.rosterUserIds))
    return a.roleAssignments.some(
      (r) => r.userId === self && r.role === 'spymaster',
    );
  if (myRole.value?.role !== 'spymaster') return false;
  return myRole.value.team === a.currentTeam;
});

const roleLabel = computed(() => {
  const r = myRole.value;
  if (!r) return null;
  const team = r.team === 'red' ? 'Red' : 'Blue';
  const role = r.role === 'spymaster' ? 'Spymaster' : 'Operative';
  return `${team} ${role}`;
});
</script>

<template>
  <div
    class="en-root custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-auto"
  >
    <div
      v-if="!act"
      class="en-panel en-panel--idle mx-auto w-full max-w-2xl px-4 py-10 text-center"
    >
      <p class="text-sm font-medium text-fg">{{ emptyTitle }}</p>
      <p class="mt-2 text-xs text-fg-soft">
        {{ emptyBody }}
      </p>
    </div>

    <template v-else>
      <div
        v-if="act.phase === 'lobby'"
        class="en-panel en-lobby mx-auto w-full max-w-lg px-4 py-6"
      >
        <p class="en-lobby__title">Lobby</p>
        <p class="mt-1 text-sm text-fg-soft">
          {{ codenamesRosterUserIds.length }} in activity
          <span
            v-if="
              !isSoloRoster &&
              codenamesRosterUserIds.length < VC_CODENAMES_MIN_PLAYERS
            "
            class="text-amber-600"
          >
            · {{ VC_CODENAMES_MIN_PLAYERS }}+ for auto teams</span
          >
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            class="en-btn en-btn--primary"
            :disabled="
              codenamesRosterUserIds.length < minPlayers || !isOrchestrator
            "
            @click="applySuggestedTeams"
          >
            Suggested teams
          </button>
          <button
            type="button"
            class="en-btn en-btn--secondary"
            :disabled="!act.roleAssignments.length || !isOrchestrator"
            @click="onDeal"
          >
            Deal board
          </button>
        </div>
        <p v-if="setupError" class="mt-3 text-sm text-red-600">
          {{ setupError }}
        </p>
        <p v-if="dealError" class="mt-3 text-sm text-red-600">
          {{ dealError }}
        </p>
        <ul
          v-if="act.roleAssignments.length"
          class="mt-4 space-y-1 border-t border-border/60 pt-4 text-sm text-fg-soft"
        >
          <li v-for="r in act.roleAssignments" :key="r.userId">
            <span class="font-medium text-fg">{{
              displayNameFor(r.userId)
            }}</span>
            <span
              class="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              :class="
                r.team === 'red'
                  ? 'en-badge en-badge--red'
                  : 'en-badge en-badge--blue'
              "
            >
              {{ r.team }} {{ r.role }}
            </span>
          </li>
        </ul>
      </div>

      <div
        v-else-if="act.phase === 'paused_requires_new_game'"
        class="en-panel en-panel--idle mx-auto w-full max-w-md px-4 py-10 text-center"
      >
        <p class="font-semibold text-fg">Board key was lost</p>
        <p class="mt-2 text-sm text-fg-soft">Start a new round to continue.</p>
        <button
          type="button"
          class="en-btn en-btn--primary mt-5"
          @click="requestVcCodenamesNewGame()"
        >
          New game
        </button>
      </div>

      <div
        v-else-if="act.phase === 'game_over'"
        class="en-panel en-panel--idle mx-auto w-full max-w-md px-4 py-10 text-center"
      >
        <p
          class="text-2xl font-extrabold tracking-tight"
          :class="act.winner === 'red' ? 'text-red-500' : 'text-blue-500'"
        >
          {{ act.winner === 'red' ? 'Red' : 'Blue' }} wins
        </p>
        <button
          type="button"
          class="en-btn en-btn--primary mt-5"
          @click="requestVcCodenamesNewGame()"
        >
          Play again
        </button>
      </div>

      <template v-else-if="act.phase === 'playing'">
        <div
          class="en-board-wrap flex min-h-0 flex-1 flex-col px-2 py-3 sm:px-4"
        >
          <div class="en-scorebar" role="status" aria-live="polite">
            <div
              class="en-team en-team--red"
              :class="{ 'en-team--active': act.currentTeam === 'red' }"
            >
              <span class="en-team__label">Red</span>
              <span v-if="teamCounts" class="en-team__count">{{
                teamCounts.red
              }}</span>
            </div>

            <div class="en-clue-center">
              <p
                v-if="act.turnStage === 'await_clue'"
                class="en-clue-center__hint"
              >
                {{ act.currentTeam === 'red' ? 'Red' : 'Blue' }} spymaster
              </p>
              <p
                v-else-if="act.currentClue"
                class="en-clue-center__clue"
                :aria-label="`Clue ${act.currentClue.word} ${act.currentClue.number}`"
              >
                <span class="en-clue-center__word">{{
                  act.currentClue.word
                }}</span>
                <span class="en-clue-center__num">{{
                  act.currentClue.number
                }}</span>
              </p>
              <p v-else class="en-clue-center__hint">Guessing</p>
              <p
                v-if="act.turnStage === 'await_guess'"
                class="en-clue-center__sub"
              >
                {{ act.guessesRemaining }} guess{{
                  act.guessesRemaining === 1 ? '' : 'es'
                }}
                left
              </p>
            </div>

            <div
              class="en-team en-team--blue"
              :class="{ 'en-team--active': act.currentTeam === 'blue' }"
            >
              <span class="en-team__label">Blue</span>
              <span v-if="teamCounts" class="en-team__count">{{
                teamCounts.blue
              }}</span>
            </div>
          </div>

          <p
            v-if="
              roleLabel || (canSeeSpymasterKey && myRole?.role === 'spymaster')
            "
            class="en-role-hint mx-auto mt-2 max-w-3xl text-center text-[11px] font-medium uppercase tracking-wider text-fg-subtle"
          >
            <span v-if="roleLabel">{{ roleLabel }}</span>
            <span v-if="canSeeSpymasterKey"> · key visible</span>
          </p>

          <div class="en-board-frame mx-auto mt-3 w-full max-w-3xl flex-1">
            <div class="en-grid" role="grid" aria-label="Word grid">
              <button
                v-for="(cell, i) in act.cells"
                :key="i"
                type="button"
                role="gridcell"
                class="en-card"
                :class="cardClass(cell, i)"
                :disabled="!canGuess || cell.revealed"
                @click="requestVcCodenamesReveal(i)"
              >
                <span class="en-card__word">{{ cell.word }}</span>
              </button>
            </div>
          </div>

          <div
            v-if="canClue"
            class="en-spymaster-bar mx-auto mt-4 w-full max-w-3xl px-1"
          >
            <p class="en-spymaster-bar__label">Give clue</p>
            <div class="en-spymaster-bar__row">
              <input
                v-model="clueWord"
                class="en-input en-input--clue"
                maxlength="64"
                autocomplete="off"
                placeholder="One word"
                aria-label="Clue word"
              />
              <input
                v-model.number="clueNumber"
                type="number"
                min="0"
                max="9"
                class="en-input en-input--num"
                aria-label="Clue number"
              />
              <button
                type="button"
                class="en-btn en-btn--primary en-btn--clue"
                @click="onClueSubmit"
              >
                OK
              </button>
            </div>
          </div>

          <div
            v-if="canGuess"
            class="mx-auto mt-3 flex w-full max-w-3xl justify-center px-1"
          >
            <button
              type="button"
              class="en-btn en-btn--secondary"
              @click="requestVcCodenamesEndTurn()"
            >
              End turn
            </button>
          </div>

          <button
            v-if="myRole?.role === 'spymaster' && !isOrchestrator"
            type="button"
            class="mx-auto mt-3 block text-xs font-medium text-primary underline-offset-2 hover:underline"
            @click="requestVcCodenamesPushKeyToOrchestrator()"
          >
            Send key to session host
          </button>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped src="./styles/VcCodenamesGame.scss"></style>
