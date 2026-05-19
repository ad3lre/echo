<script setup lang="ts">
import { ref } from 'vue';
import { icons } from '@/assets/icons';
import { playEchoSound } from '@/composables/useEchoSounds';
import { ECHO_SOUND_IDS, type EchoSoundId } from '@/audio/echoSoundAssets';
import SettingsPillSwitch from '@/features/settings/components/SettingsPillSwitch.vue';
import SettingsSettingRow from '@/features/settings/components/SettingsSettingRow.vue';

const props = defineProps<{
  form: any;
}>();

const volumeExpandedFor = ref<EchoSoundId | null>(null);

const SOUND_LABELS: Record<EchoSoundId, string> = {
  streamStart: 'Stream started',
  streamEnd: 'Stream ended',
  videoStart: 'Camera enabled',
  videoEnd: 'Camera disabled',
  streamJoinSelf: 'Joined stream',
  streamViewerArrive: 'Viewer joined your stream',
  joinVoiceChannel: 'Joined voice channel',
  streamViewerLeave: 'Viewer left your stream',
  pttOn: 'Push-to-talk on',
  pttOff: 'Push-to-talk off',
  vcMute: 'Muted',
  vcUnmute: 'Unmuted',
  vcDeafen: 'Deafened',
  vcUndeafen: 'Undeafened',
  pingActive: 'Active mention',
  pingDirectMention: 'Direct mention',
  pingDm: 'Direct message',
  pingEveryone: '@everyone mention',
  leaveVc: 'Left voice channel',
};

const sortedSoundIds = [...ECHO_SOUND_IDS].sort((a, b) =>
  SOUND_LABELS[a].localeCompare(SOUND_LABELS[b]),
);

function isSoundEnabled(id: EchoSoundId): boolean {
  return props.form.notificationSettings.soundEffectsById[id] !== false;
}

function setSoundEnabled(id: EchoSoundId, next: boolean) {
  props.form.notificationSettings.soundEffectsById[id] = next;
}

function soundVolume(id: EchoSoundId): number {
  return props.form.notificationSettings.soundEffectsVolumeById[id] ?? 100;
}

function setSoundVolume(id: EchoSoundId, event: Event) {
  const target = event.target as HTMLInputElement | null;
  const next = Number(target?.value ?? 100);
  props.form.notificationSettings.soundEffectsVolumeById[id] = Math.max(
    0,
    Math.min(100, Number.isFinite(next) ? next : 100),
  );
}

function toggleVolumePanel(id: EchoSoundId) {
  volumeExpandedFor.value = volumeExpandedFor.value === id ? null : id;
}

function previewSound(id: EchoSoundId) {
  playEchoSound(id, { volume: 1 });
}

function volumeButtonLabel(id: EchoSoundId): string {
  return `Event volume (${soundVolume(id)}%) — ${SOUND_LABELS[id]}`;
}

function soundLevelLabel(id: EchoSoundId): string {
  return `${soundVolume(id)}% event volume`;
}

function onSoundCheckboxChange(id: EchoSoundId, e: Event) {
  const el = e.target as HTMLInputElement | null;
  if (!el) return;
  setSoundEnabled(id, el.checked);
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-6">
    <section class="settings-card rounded-2xl p-5">
      <div class="settings-label">Global</div>
      <p class="mt-2 max-w-prose text-sm leading-relaxed text-fg-soft">
        Set the overall sound state and master level for this device before
        fine-tuning individual events.
      </p>
      <div class="mt-4">
        <p class="text-xs text-fg-subtle">
          Control the master state first, then use it as the baseline for each
          event below.
        </p>
      </div>

      <div class="mt-4 flex min-w-0 flex-col divide-y divide-border/50">
        <SettingsSettingRow
          title="All sounds"
          description="Master switch for every event sound below."
        >
          <template #control>
            <SettingsPillSwitch
              :model-value="form.notificationSettings.soundEffects"
              ariaLabel="Enable all sound effects"
              @update:model-value="
                form.notificationSettings.soundEffects = $event
              "
            />
          </template>
        </SettingsSettingRow>

        <div class="min-w-0 pt-4">
          <div class="flex min-w-0 items-start gap-3">
            <img
              :src="icons.sliders"
              alt=""
              class="settings-sounds__inline-icon mt-0.5 h-5 w-5 shrink-0 opacity-70"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold tracking-tight text-foreground">
                Master level
              </div>
              <p class="mt-1 max-w-prose text-xs leading-relaxed text-muted">
                Scales every enabled sound before per-event volume.
              </p>
              <div
                class="mt-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <input
                  v-model.number="
                    form.notificationSettings.soundEffectsMasterVolume
                  "
                  type="range"
                  min="0"
                  max="100"
                  class="settings-sounds__master-range min-w-0 w-full flex-1 accent-indigo-400"
                />
                <span
                  class="settings-sounds__readout shrink-0 text-right text-xs font-semibold tabular-nums text-muted"
                >
                  {{ form.notificationSettings.soundEffectsMasterVolume }}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="settings-card rounded-2xl p-5">
      <div class="settings-label">Per Event</div>
      <p class="mt-2 max-w-prose text-sm leading-relaxed text-fg-soft">
        Enable or mute specific sounds, preview them, and open event volume only
        when you need extra control.
      </p>
      <div class="mt-4">
        <p class="text-xs text-fg-subtle">
          Use the checkbox to enable each sound, preview it, and open volume
          when you need finer control.
        </p>
      </div>

      <ul
        class="mt-4 m-0 flex list-none flex-col divide-y divide-border/50 p-0"
      >
        <li v-for="id in sortedSoundIds" :key="id" class="min-w-0 py-4">
          <div
            class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
          >
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold tracking-tight text-foreground">
                {{ SOUND_LABELS[id] }}
              </div>
              <p class="mt-1 text-xs leading-relaxed text-muted">
                {{ soundLevelLabel(id) }}
              </p>
            </div>

            <div
              class="settings-sounds__controls flex shrink-0 flex-wrap items-center justify-end gap-2 sm:pl-4"
            >
              <button
                type="button"
                class="settings-sounds__icon-btn"
                :class="{
                  'settings-sounds__icon-btn--active': volumeExpandedFor === id,
                }"
                :aria-expanded="volumeExpandedFor === id"
                :aria-label="volumeButtonLabel(id)"
                :title="`Volume ${soundVolume(id)}%`"
                @click="toggleVolumePanel(id)"
              >
                <img
                  :src="icons.volumeUp"
                  alt=""
                  class="settings-sounds__icon-img"
                />
              </button>
              <button
                type="button"
                class="settings-sounds__icon-btn"
                :disabled="!form.notificationSettings.soundEffects"
                :aria-label="`Play preview — ${SOUND_LABELS[id]}`"
                title="Play preview"
                @click="previewSound(id)"
              >
                <svg
                  class="settings-sounds__icon-svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M8 5v14l11-7L8 5z" />
                </svg>
              </button>
              <input
                type="checkbox"
                class="settings-sounds__checkbox"
                :checked="isSoundEnabled(id)"
                :disabled="!form.notificationSettings.soundEffects"
                :aria-label="`Sound on for ${SOUND_LABELS[id]}`"
                @change="onSoundCheckboxChange(id, $event)"
              />
            </div>
          </div>

          <div
            v-if="volumeExpandedFor === id"
            class="settings-sounds__volume-panel mt-3 border-t border-border/40 pt-3"
          >
            <div
              class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
            >
              <div class="flex min-w-0 items-center gap-3 sm:flex-1">
                <img
                  :src="icons.sliders"
                  alt=""
                  class="settings-sounds__inline-icon h-4 w-4 shrink-0 opacity-60"
                  aria-hidden="true"
                />
                <input
                  :value="soundVolume(id)"
                  type="range"
                  min="0"
                  max="100"
                  class="min-w-0 w-full max-w-full flex-1 accent-indigo-400"
                  @input="setSoundVolume(id, $event)"
                />
              </div>
              <span
                class="settings-sounds__readout shrink-0 text-right text-xs font-semibold tabular-nums text-muted"
              >
                {{ soundVolume(id) }}%
              </span>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped lang="scss">
.settings-sounds__master-range {
  /* Keep thumb inside padded tile */
  min-height: 1.75rem;
}

.settings-sounds__icon-btn {
  display: inline-flex;
  height: 2.25rem;
  width: 2.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  border: none;
  background: var(--ui-glass-1);
  color: var(--ui-fg-soft);
  outline: none;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;

  &:hover:not(:disabled) {
    background: var(--ui-glass-hover);
    color: var(--ui-fg);
  }

  &:focus-visible {
    box-shadow:
      0 0 0 2px var(--bg),
      0 0 0 4px color-mix(in srgb, var(--accent) 45%, transparent);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.32;
  }

  &--active {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--text);
  }
}

/* Inline glyph next to row content. Dark inverts black SVGs to white; light keeps ink. */
.settings-sounds__inline-icon {
  filter: var(--chat-inline-icon-filter);
}

.settings-sounds__icon-img {
  height: 1rem;
  width: 1rem;
  opacity: 0.88;
  filter: var(--chat-inline-icon-filter);
}

.settings-sounds__icon-svg {
  width: 1rem;
  height: 1rem;
}

.settings-sounds__volume-panel {
  box-sizing: border-box;
}

.settings-sounds__controls {
  min-height: 2.625rem;
}

/* Matches .settings-sounds__icon-btn footprint (square “chip” controls in a row). */
.settings-sounds__checkbox {
  appearance: none;
  -webkit-appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
  margin: 0;
  border-radius: 0.5rem;
  border: none;
  background: var(--ui-glass-1);
  cursor: pointer;
  outline: none;
  transition: background-color 0.12s ease;
}

.settings-sounds__checkbox:hover:not(:disabled) {
  background: var(--ui-glass-hover);
}

.settings-sounds__checkbox:focus-visible {
  box-shadow:
    0 0 0 2px var(--bg),
    0 0 0 4px color-mix(in srgb, var(--accent) 45%, transparent);
}

.settings-sounds__checkbox:disabled {
  cursor: not-allowed;
  opacity: 0.32;
}

.settings-sounds__checkbox:checked {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
}

/* Checkmark uses an accent ink so it reads on both light and dark glass. */
.settings-sounds__checkbox:checked::after {
  content: '';
  width: 0.55rem;
  height: 0.3rem;
  margin-top: -0.08rem;
  border: 2px solid var(--accent);
  border-top: 0;
  border-left: 0;
  transform: rotate(45deg);
}
</style>
