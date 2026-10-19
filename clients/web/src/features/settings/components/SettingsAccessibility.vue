<script setup lang="ts">
import { echoT } from '@/i18n';
import { useId } from 'vue';
import SettingsPillSwitch from './SettingsPillSwitch.vue';
import type { SettingsForm } from '@/features/settings/composables/useSettingsForm';

const props = defineProps<{
  form: SettingsForm;
}>();

const fontScaleId = useId();
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-2">
    <!-- Readability card -->
    <div class="settings-card rounded-2xl p-5">
      <div class="settings-label" aria-hidden="true">
        {{ echoT('settingsUi.readability') }}
      </div>
      <div
        class="mt-4 flex flex-col gap-3"
        role="group"
        :aria-label="echoT('settingsUi.readability')"
      >
        <!-- High contrast -->
        <div class="settings-toggle">
          <span>
            <span class="block text-sm font-semibold text-foreground">{{
              echoT('settingsUi.highContrast')
            }}</span>
            <span class="block text-sm text-muted">
              {{ echoT('panes.a11y.highContrastDesc') }}
            </span>
          </span>
          <SettingsPillSwitch
            v-model="props.form.accessibilitySettings.highContrast"
            :ariaLabel="echoT('settingsUi.highContrast')"
          />
        </div>

        <!-- Dyslexia-friendly font -->
        <div class="settings-toggle">
          <span>
            <span class="block text-sm font-semibold text-foreground">{{
              echoT('panes.a11y.dyslexia')
            }}</span>
            <span class="block text-sm text-muted">
              {{ echoT('panes.a11y.dyslexiaDesc') }}
            </span>
          </span>
          <SettingsPillSwitch
            v-model="props.form.accessibilitySettings.dyslexiaFriendlyFont"
            :ariaLabel="echoT('panes.a11y.dyslexia')"
          />
        </div>

        <!-- Message spacing -->
        <div class="settings-toggle">
          <span>
            <span class="block text-sm font-semibold text-foreground">{{
              echoT('panes.a11y.messageSpacing')
            }}</span>
            <span class="block text-sm text-muted">
              {{ echoT('panes.a11y.messageSpacingDesc') }}
            </span>
          </span>
          <SettingsPillSwitch
            v-model="props.form.accessibilitySettings.showMessageSpacing"
            :ariaLabel="echoT('panes.a11y.messageSpacing')"
          />
        </div>

        <!-- Solid glass surfaces -->
        <div class="settings-toggle">
          <span>
            <span class="block text-sm font-semibold text-foreground">{{
              echoT('panes.a11y.solidGlass')
            }}</span>
            <span class="block text-sm text-muted">
              {{ echoT('panes.a11y.solidGlassDesc') }}
            </span>
          </span>
          <SettingsPillSwitch
            v-model="props.form.accessibilitySettings.solidGlassSurfaces"
            :ariaLabel="echoT('panes.a11y.solidGlass')"
          />
        </div>
      </div>
    </div>

    <!-- Motion & Layout card -->
    <div class="settings-card rounded-2xl p-5">
      <div class="settings-label" aria-hidden="true">
        {{ echoT('panes.a11y.motionLayout') }}
      </div>
      <div
        class="mt-4 flex flex-col gap-3"
        role="group"
        :aria-label="echoT('panes.a11y.motionLayoutAria')"
      >
        <!-- Reduced motion -->
        <div class="settings-toggle">
          <span>
            <span class="block text-sm font-semibold text-foreground">{{
              echoT('panes.a11y.reducedMotion')
            }}</span>
            <span class="block text-sm text-muted">
              {{ echoT('panes.a11y.reducedMotionDesc') }}
            </span>
          </span>
          <SettingsPillSwitch
            v-model="props.form.accessibilitySettings.reducedMotion"
            :ariaLabel="echoT('panes.a11y.reducedMotion')"
          />
        </div>

        <!-- Font scale -->
        <div class="settings-field">
          <label :for="fontScaleId" class="settings-label">{{
            echoT('panes.a11y.fontScale')
          }}</label>
          <div class="settings-input">
            <input
              :id="fontScaleId"
              v-model.number="props.form.fontScale"
              class="w-full accent-indigo-400"
              type="range"
              min="85"
              max="135"
              step="5"
              :aria-valuetext="
                echoT('panes.a11y.percent', { n: props.form.fontScale })
              "
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
