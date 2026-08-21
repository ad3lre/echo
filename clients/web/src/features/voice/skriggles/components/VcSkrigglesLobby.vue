<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  EchoSkrigglesActivityV1,
  EchoSkrigglesSettingsV1,
} from '@/audio/voiceEchoLiveKitData';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { SKRIGGLES_MIN_PLAYERS } from '@/features/voice/skriggles/vcSkrigglesReducer';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';

const props = defineProps<{
  activity: EchoSkrigglesActivityV1;
  rosterUserIds: readonly string[];
  voiceParticipants: readonly { id: string; name: string; pfp?: string }[];
  isOrchestrator: boolean;
  updateSettings: (settings: Partial<EchoSkrigglesSettingsV1>) => void;
  startGame: () => void;
  displayNameFor: (userId: string) => string;
}>();

const localSettings = ref({ ...props.activity.settings });

watch(
  () => props.activity.settings,
  (s) => {
    localSettings.value = { ...s };
  },
  { deep: true },
);

const canStart = computed(
  () =>
    props.isOrchestrator && props.rosterUserIds.length >= SKRIGGLES_MIN_PLAYERS,
);

const startHint = computed(() => {
  if (props.rosterUserIds.length < SKRIGGLES_MIN_PLAYERS) {
    return `Need at least ${SKRIGGLES_MIN_PLAYERS} players in Skriggles to start.`;
  }
  if (!props.isOrchestrator) {
    return 'Waiting for the roster host to start the game.';
  }
  return 'Configure settings and start when everyone is ready.';
});

function pfpFor(userId: string): string {
  const raw = props.voiceParticipants.find((p) => p.id === userId)?.pfp?.trim();
  return raw ?? '';
}

function patchSettings(patch: Partial<EchoSkrigglesSettingsV1>): void {
  if (!props.isOrchestrator) return;
  localSettings.value = { ...localSettings.value, ...patch };
  props.updateSettings(patch);
}

function onStart(): void {
  if (!canStart.value) return;
  props.startGame();
}
</script>

<template>
  <section class="sk-lobby" aria-label="Skriggles lobby">
    <div class="sk-lobby__grid">
      <div class="sk-lobby__panel">
        <p class="sk-lobby__eyebrow">Game settings</p>
        <p v-if="!isOrchestrator" class="sk-lobby__readonly">
          Only the roster host can change settings.
        </p>

        <label class="sk-lobby__field">
          <span>Rounds</span>
          <input
            type="range"
            min="2"
            max="10"
            step="1"
            :value="localSettings.rounds"
            :disabled="!isOrchestrator"
            @input="
              patchSettings({
                rounds: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
          <span class="sk-lobby__value">{{ localSettings.rounds }}</span>
        </label>

        <label class="sk-lobby__field">
          <span>Draw time (sec)</span>
          <input
            type="range"
            min="15"
            max="240"
            step="5"
            :value="localSettings.drawTimeSec"
            :disabled="!isOrchestrator"
            @input="
              patchSettings({
                drawTimeSec: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
          <span class="sk-lobby__value">{{ localSettings.drawTimeSec }}s</span>
        </label>

        <label class="sk-lobby__field">
          <span>Word pick (sec)</span>
          <input
            type="range"
            min="5"
            max="30"
            step="1"
            :value="localSettings.wordPickSec"
            :disabled="!isOrchestrator"
            @input="
              patchSettings({
                wordPickSec: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
          <span class="sk-lobby__value">{{ localSettings.wordPickSec }}s</span>
        </label>

        <label class="sk-lobby__field">
          <span>Min word length</span>
          <input
            type="range"
            min="0"
            max="5"
            step="1"
            :value="localSettings.minWordLen"
            :disabled="!isOrchestrator"
            @input="
              patchSettings({
                minWordLen: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
          <span class="sk-lobby__value">{{
            localSettings.minWordLen || 'Any'
          }}</span>
        </label>

        <label class="sk-lobby__check">
          <input
            type="checkbox"
            :checked="localSettings.hints"
            :disabled="!isOrchestrator"
            @change="
              patchSettings({
                hints: ($event.target as HTMLInputElement).checked,
              })
            "
          />
          <span>Reveal first letter at half time</span>
        </label>

        <label class="sk-lobby__field sk-lobby__field--stack">
          <span>Custom words (comma or newline separated)</span>
          <textarea
            :value="localSettings.customWords"
            rows="3"
            class="sk-lobby__textarea"
            placeholder="Optional — e.g. echo, party, voice"
            :disabled="!isOrchestrator"
            @change="
              patchSettings({
                customWords: ($event.target as HTMLTextAreaElement).value,
              })
            "
          />
        </label>
      </div>

      <div class="sk-lobby__panel">
        <p class="sk-lobby__eyebrow">Players ({{ rosterUserIds.length }})</p>
        <ol class="sk-lobby__players">
          <li v-for="uid in rosterUserIds" :key="uid" class="sk-lobby__player">
            <PausedGifAvatar
              :src="safeImageUrl(pfpFor(uid))"
              :alt="displayNameFor(uid)"
              :session-key="uid"
              wrapper-class="relative block h-7 w-7 shrink-0 overflow-hidden rounded-full ring-1 ring-white/12"
              img-class="rounded-full object-cover"
            />
            <span class="sk-lobby__player-name">{{ displayNameFor(uid) }}</span>
          </li>
        </ol>
      </div>
    </div>

    <div class="sk-lobby__footer">
      <p class="sk-lobby__hint">{{ startHint }}</p>
      <button
        type="button"
        class="sk-btn sk-btn--start"
        :disabled="!canStart"
        @click="onStart"
      >
        Start game
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.sk-lobby {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 0.75rem;
}

.sk-lobby__grid {
  display: grid;
  gap: 0.75rem;

  @media (min-width: 640px) {
    grid-template-columns: 1fr 1fr;
  }
}

.sk-lobby__panel {
  background: var(--sk-surface);
  border: 1px solid var(--sk-border-mid);
  border-radius: var(--sk-radius);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.sk-lobby__eyebrow {
  margin: 0;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--sk-accent);
}

.sk-lobby__readonly {
  margin: 0;
  font-size: 0.76rem;
  color: var(--sk-text-muted);
}

.sk-lobby__field {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.35rem 0.65rem;
  align-items: center;
  font-size: 0.78rem;
  color: var(--sk-text-soft);

  input[type='range'] {
    grid-column: 1 / -1;
    width: 100%;
  }
}

.sk-lobby__field--stack {
  grid-template-columns: 1fr;
}

.sk-lobby__value {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.72rem;
  color: var(--sk-text);
}

.sk-lobby__check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  color: var(--sk-text-soft);
  cursor: pointer;

  input {
    accent-color: var(--sk-accent);
  }
}

.sk-lobby__textarea {
  width: 100%;
  resize: vertical;
  min-height: 4rem;
  border-radius: 8px;
  border: 1px solid var(--sk-border-mid);
  background: rgba(255, 255, 255, 0.04);
  color: var(--sk-text);
  font-size: 0.8rem;
  padding: 0.55rem 0.65rem;
  outline: none;

  &:focus {
    border-color: rgba(124, 58, 237, 0.5);
  }
}

.sk-lobby__players {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.sk-lobby__player {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.4rem 0.45rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--sk-border);
}

.sk-lobby__player-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--sk-text);
}

.sk-lobby__footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  padding-top: 0.25rem;
}

.sk-lobby__hint {
  margin: 0;
  font-size: 0.76rem;
  color: var(--sk-text-muted);
  text-align: center;
  max-width: 24rem;
  line-height: 1.45;
}

.sk-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  transition:
    opacity 0.15s,
    transform 0.1s;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }
}

.sk-btn--start {
  padding: 0.7rem 2rem;
  font-size: 0.92rem;
  background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
  color: white;
  box-shadow:
    0 4px 0 #2d1668,
    0 6px 20px rgba(124, 58, 237, 0.35);
}
</style>
