<script setup lang="ts">
import { echoT } from '@/i18n';
import { watch } from 'vue';
import SettingsPillSwitch from '@/features/settings/components/SettingsPillSwitch.vue';
import SettingsSettingRow from '@/features/settings/components/SettingsSettingRow.vue';
import { authPatchMe } from '@/api/authClient';
import type { SettingsForm } from '@/features/settings/composables/useSettingsForm';

const props = defineProps<{
  form: SettingsForm;
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
      <div class="settings-label">{{ echoT('panes.friends.requests') }}</div>
      <i18n-t
        keypath="panes.friends.intro"
        tag="p"
        scope="global"
        class="mt-2 max-w-prose text-sm leading-relaxed text-fg-soft"
      >
        <template #sounds>
          <span class="font-semibold text-fg-soft">{{
            echoT('panes.friends.sounds')
          }}</span>
        </template>
        <template #notifications>
          <span class="font-semibold text-fg-soft">{{
            echoT('panes.friends.notifications')
          }}</span>
        </template>
      </i18n-t>

      <div class="mt-4">
        <p class="text-xs text-fg-subtle">
          {{ echoT('panes.friends.disabledNote') }}
        </p>
      </div>

      <div class="mt-4 flex min-w-0 flex-col divide-y divide-border/50">
        <SettingsSettingRow
          :title="echoT('panes.friends.friendRequests')"
          :description="echoT('panes.friends.friendRequestsDesc')"
        >
          <template #control>
            <SettingsPillSwitch
              :model-value="form.privacySettings.friendRequests"
              :ariaLabel="echoT('panes.friends.allowFriendRequests')"
              @update:model-value="form.privacySettings.friendRequests = $event"
            />
          </template>
        </SettingsSettingRow>

        <SettingsSettingRow
          :title="echoT('panes.friends.messageRequests')"
          :description="echoT('panes.friends.messageRequestsDesc')"
        >
          <template #control>
            <SettingsPillSwitch
              :model-value="form.privacySettings.allowMessages"
              :ariaLabel="echoT('panes.friends.allowMessageRequests')"
              @update:model-value="form.privacySettings.allowMessages = $event"
            />
          </template>
        </SettingsSettingRow>

        <SettingsSettingRow
          :title="echoT('panes.friends.showLastOnline')"
          :description="echoT('panes.friends.showLastOnlineDesc')"
        >
          <template #control>
            <SettingsPillSwitch
              :model-value="form.privacySettings.showLastOnline"
              :ariaLabel="echoT('panes.friends.showLastOnlineAria')"
              @update:model-value="form.privacySettings.showLastOnline = $event"
            />
          </template>
        </SettingsSettingRow>
      </div>
    </section>
  </div>
</template>
