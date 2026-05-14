<script setup lang="ts">
import { watch } from 'vue';
import SettingsPillSwitch from '@/features/settings/components/SettingsPillSwitch.vue';
import SettingsSettingRow from '@/features/settings/components/SettingsSettingRow.vue';
import { authPatchMe } from '@/api/authClient';

const props = defineProps<{
  form: any;
}>();

// Persist showLastOnline changes to backend
watch(
  () => props.form.privacySettings.showLastOnline,
  async (newValue, oldValue) => {
    if (oldValue === undefined) return; // Skip initial value
    try {
      await authPatchMe({ showLastOnline: newValue });
    } catch (e) {
      console.error('Failed to update showLastOnline setting:', e);
    }
  },
);
</script>

<template>
  <div class="flex min-w-0 flex-col gap-6">
    <section class="settings-card rounded-2xl p-5">
      <div class="settings-label">Requests</div>
      <p class="mt-2 max-w-prose text-sm leading-relaxed text-fg-soft">
        Manage whether people can reach out to you directly. Sound behavior
        lives in <span class="font-semibold text-fg-soft">Sounds</span>, and
        desktop alerts live in
        <span class="font-semibold text-fg-soft">Notifications</span>.
      </p>

      <div class="mt-4">
        <p class="text-xs text-fg-subtle">
          When disabled, others cannot start that kind of request toward you.
        </p>
      </div>

      <div class="mt-4 flex min-w-0 flex-col divide-y divide-border/50">
        <SettingsSettingRow
          title="Friend requests"
          description="Let people send you requests to become friends."
        >
          <template #control>
            <SettingsPillSwitch
              :model-value="form.privacySettings.friendRequests"
              ariaLabel="Allow friend requests"
              @update:model-value="form.privacySettings.friendRequests = $event"
            />
          </template>
        </SettingsSettingRow>

        <SettingsSettingRow
          title="Message requests"
          description="Let people who are not friends open a DM or request to message you."
        >
          <template #control>
            <SettingsPillSwitch
              :model-value="form.privacySettings.allowMessages"
              ariaLabel="Allow message requests"
              @update:model-value="form.privacySettings.allowMessages = $event"
            />
          </template>
        </SettingsSettingRow>

        <SettingsSettingRow
          title="Show last online"
          description="Let friends and server members see when you were last online."
        >
          <template #control>
            <SettingsPillSwitch
              :model-value="form.privacySettings.showLastOnline"
              ariaLabel="Show last online status"
              @update:model-value="form.privacySettings.showLastOnline = $event"
            />
          </template>
        </SettingsSettingRow>
      </div>
    </section>
  </div>
</template>
