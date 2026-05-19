<script setup lang="ts">
import { useId } from 'vue';
import SettingsPillSwitch from './SettingsPillSwitch.vue';

const props = defineProps<{
  form: any;
}>();

const fontScaleId = useId();
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-2">
    <!-- Readability card -->
    <div class="settings-card rounded-2xl p-5">
      <div class="settings-label" aria-hidden="true">Readability</div>
      <div class="mt-4 flex flex-col gap-3" role="group" aria-label="Readability">
        <!-- High contrast -->
        <div class="settings-toggle">
          <span>
            <span class="block text-sm font-semibold text-foreground">High contrast</span>
            <span class="block text-sm text-muted">
              Increase contrast in text, borders, and key actions.
            </span>
          </span>
          <SettingsPillSwitch
            v-model="props.form.accessibilitySettings.highContrast"
            ariaLabel="High contrast"
          />
        </div>

        <!-- Dyslexia-friendly font -->
        <div class="settings-toggle">
          <span>
            <span class="block text-sm font-semibold text-foreground">Dyslexia-friendly font</span>
            <span class="block text-sm text-muted">
              Swap the main UI font for Atkinson Hyperlegible, a more readable alternative.
            </span>
          </span>
          <SettingsPillSwitch
            v-model="props.form.accessibilitySettings.dyslexiaFriendlyFont"
            ariaLabel="Dyslexia-friendly font"
          />
        </div>

        <!-- Message spacing -->
        <div class="settings-toggle">
          <span>
            <span class="block text-sm font-semibold text-foreground">Message spacing</span>
            <span class="block text-sm text-muted">
              Add extra vertical breathing room between messages for easier scanning.
            </span>
          </span>
          <SettingsPillSwitch
            v-model="props.form.accessibilitySettings.showMessageSpacing"
            ariaLabel="Message spacing"
          />
        </div>
      </div>
    </div>

    <!-- Motion & Layout card -->
    <div class="settings-card rounded-2xl p-5">
      <div class="settings-label" aria-hidden="true">Motion &amp; Layout</div>
      <div class="mt-4 flex flex-col gap-3" role="group" aria-label="Motion and Layout">
        <!-- Reduced motion -->
        <div class="settings-toggle">
          <span>
            <span class="block text-sm font-semibold text-foreground">Reduced motion</span>
            <span class="block text-sm text-muted">
              Tone down transitions, blur shifts, and UI animations.
            </span>
          </span>
          <SettingsPillSwitch
            v-model="props.form.accessibilitySettings.reducedMotion"
            ariaLabel="Reduced motion"
          />
        </div>

        <!-- Font scale -->
        <div class="settings-field">
          <label :for="fontScaleId" class="settings-label">Font scale</label>
          <div class="settings-input">
            <input
              :id="fontScaleId"
              v-model.number="props.form.fontScale"
              class="w-full accent-indigo-400"
              type="range"
              min="85"
              max="135"
              step="5"
              :aria-valuetext="`${props.form.fontScale} percent`"
            />
            <div class="mt-2 text-sm text-fg-soft" aria-hidden="true">
              {{ props.form.fontScale }}%
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
