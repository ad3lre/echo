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

<style scoped lang="scss" src="./styles/VcSkrigglesLobby.scss"></style>
