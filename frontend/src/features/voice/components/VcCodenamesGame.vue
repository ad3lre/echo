<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
  EchoCodenamesActivityV1,
  EchoCodenamesAffiliationV1,
  EchoCodenamesPublicCellV1,
  EchoCodenamesRoleAssignmentV1,
} from '@/audio/voiceEchoLiveKitData';
import { hangmanOrchestratorUserId } from '@/features/voice/vcHangmanReducer';
import {
  buildSoloCodenamesRoles,
  codenamesMinPlayersToStart,
  isCodenamesSoloRoster,
  VC_CODENAMES_MIN_PLAYERS,
} from '@/features/voice/vcCodenamesReducer';

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
      <p class="text-sm font-medium text-fg">Waiting for the session host</p>
      <p class="mt-2 text-xs text-fg-soft">
        The host opens the lobby from this activity. Solo works with one person;
        four or more can use suggested teams.
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

<style scoped>
.en-root {
  --en-red: #c41e3a;
  --en-red-dim: #991b1b;
  --en-blue: #1d4ed8;
  --en-blue-dim: #1e3a8a;
  --en-tile: #e8dcc4;
  --en-tile-edge: #c4b592;
  --en-tile-text: #1c1917;
  --en-felt: #14110e;
  --en-felt-edge: #2a2218;
  background:
    radial-gradient(
      120% 80% at 50% 0%,
      color-mix(in srgb, var(--en-felt-edge) 40%, transparent),
      transparent 55%
    ),
    var(--en-felt);
}

[data-theme='light'] .en-root {
  --en-felt: #3d3428;
  --en-felt-edge: #5c4f3a;
}

.en-panel {
  border-radius: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  background: color-mix(in srgb, var(--elevated) 88%, var(--bg));
}

.en-panel--idle {
  margin-top: 1.5rem;
}

.en-lobby__title {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-soft);
}

.en-badge--red {
  background: color-mix(in srgb, var(--en-red) 22%, transparent);
  color: #fecaca;
}

.en-badge--blue {
  background: color-mix(in srgb, var(--en-blue) 22%, transparent);
  color: #bfdbfe;
}

[data-theme='light'] .en-badge--red {
  color: var(--en-red-dim);
}

[data-theme='light'] .en-badge--blue {
  color: var(--en-blue-dim);
}

.en-btn {
  border-radius: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  transition:
    background 0.15s,
    transform 0.1s;
}

.en-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.en-btn--primary {
  background: linear-gradient(180deg, var(--en-red) 0%, var(--en-red-dim) 100%);
  color: #fff;
  border: 1px solid color-mix(in srgb, #fff 12%, transparent);
}

.en-btn--primary:hover:not(:disabled) {
  filter: brightness(1.06);
}

.en-btn--secondary {
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--elevated) 80%, transparent);
  color: var(--fg);
}

.en-btn--clue {
  flex-shrink: 0;
  min-width: 3.25rem;
}

.en-scorebar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: stretch;
  gap: 0.5rem;
  max-width: 48rem;
  margin-inline: auto;
  width: 100%;
}

.en-team {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  opacity: 0.72;
  transition:
    opacity 0.2s,
    box-shadow 0.2s;
}

.en-team--red {
  background: linear-gradient(135deg, var(--en-red-dim), var(--en-red));
  color: #fff;
}

.en-team--blue {
  background: linear-gradient(135deg, var(--en-blue-dim), var(--en-blue));
  color: #fff;
}

.en-team--active {
  opacity: 1;
  box-shadow:
    0 0 0 2px color-mix(in srgb, #fff 35%, transparent),
    0 8px 24px color-mix(in srgb, #000 35%, transparent);
}

.en-team__label {
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.en-team__count {
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.en-clue-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 5.5rem;
  padding: 0.35rem 0.75rem;
  text-align: center;
}

.en-clue-center__clue {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  margin: 0;
}

.en-clue-center__word {
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg);
}

.en-clue-center__num {
  font-size: 1.65rem;
  font-weight: 800;
  color: var(--fg-soft);
  font-variant-numeric: tabular-nums;
}

.en-clue-center__hint,
.en-clue-center__sub {
  margin: 0;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-soft);
}

.en-board-frame {
  padding: 0.65rem;
  border-radius: 0.65rem;
  background: linear-gradient(180deg, #2a2218 0%, #1a1510 100%);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent),
    0 12px 40px color-mix(in srgb, #000 45%, transparent);
}

[data-theme='light'] .en-board-frame {
  background: linear-gradient(180deg, #4a3f32 0%, #352c22 100%);
}

.en-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: clamp(0.25rem, 1.2vw, 0.45rem);
  width: 100%;
  aspect-ratio: 5 / 3.35;
  max-height: min(52vh, 28rem);
}

.en-card {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 0.2rem 0.15rem;
  border: none;
  border-radius: 0.35rem;
  cursor: default;
  box-shadow:
    0 2px 0 color-mix(in srgb, #000 25%, transparent),
    inset 0 1px 0 color-mix(in srgb, #fff 35%, transparent);
  transition:
    transform 0.12s,
    box-shadow 0.12s,
    filter 0.12s;
}

.en-card__word {
  font-size: clamp(0.5rem, 2.1vw, 0.72rem);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-align: center;
  word-break: break-word;
  hyphens: auto;
}

/* Operative view: classic tan word tiles */
.en-card--aff-operative {
  background: linear-gradient(180deg, #f2ead8 0%, var(--en-tile) 100%);
  color: var(--en-tile-text);
  border: 1px solid var(--en-tile-edge);
}

.en-card--aff-operative.en-card--pickable:not(:disabled) {
  cursor: pointer;
}

.en-card--aff-operative.en-card--pickable:not(:disabled):hover {
  transform: translateY(-2px);
  box-shadow:
    0 4px 0 color-mix(in srgb, #000 22%, transparent),
    inset 0 1px 0 color-mix(in srgb, #fff 45%, transparent);
}

/* Spymaster key preview on hidden cards */
.en-card--aff-red:not(.en-card--revealed) {
  background: linear-gradient(180deg, #e85d6a 0%, var(--en-red) 100%);
  color: #fff;
  border: 2px solid color-mix(in srgb, #fff 25%, var(--en-red));
}

.en-card--aff-blue:not(.en-card--revealed) {
  background: linear-gradient(180deg, #4f7ee8 0%, var(--en-blue) 100%);
  color: #fff;
  border: 2px solid color-mix(in srgb, #fff 25%, var(--en-blue));
}

.en-card--aff-neutral:not(.en-card--revealed) {
  background: linear-gradient(180deg, #a8a29e 0%, #78716c 100%);
  color: #fafaf9;
  border: 2px solid #57534e;
}

.en-card--aff-assassin:not(.en-card--revealed) {
  background: linear-gradient(180deg, #3f3f46 0%, #18181b 100%);
  color: #fafafa;
  border: 2px solid #52525b;
}

/* Revealed tiles */
.en-card--revealed.en-card--aff-red {
  background: var(--en-red);
  color: #fff;
  border: 2px solid color-mix(in srgb, #fff 20%, var(--en-red));
}

.en-card--revealed.en-card--aff-blue {
  background: var(--en-blue);
  color: #fff;
  border: 2px solid color-mix(in srgb, #fff 20%, var(--en-blue));
}

.en-card--revealed.en-card--aff-neutral {
  background: #78716c;
  color: #fafaf9;
  border: 2px solid #57534e;
}

.en-card--revealed.en-card--aff-assassin {
  background: #18181b;
  color: #fafafa;
  border: 2px solid #3f3f46;
}

.en-spymaster-bar {
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--elevated) 75%, #000);
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

.en-spymaster-bar__label {
  margin: 0 0 0.5rem;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--fg-soft);
}

.en-spymaster-bar__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.en-input {
  border-radius: 0.4rem;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--fg);
  padding: 0.5rem 0.65rem;
  font-size: 0.875rem;
}

.en-input--clue {
  flex: 1;
  min-width: 6rem;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.en-input--num {
  width: 3.25rem;
  text-align: center;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
