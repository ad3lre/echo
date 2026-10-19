<script setup lang="ts">
import { echoT } from '@/i18n';
import type { ProfileOngoingVcActivity } from '@/features/member-profile/useProfileOngoingVcActivity';

const props = defineProps<{
  activity: ProfileOngoingVcActivity;
  /** Show a join CTA that connects voice and opens the shared activity session. */
  joinable?: boolean;
}>();

const emit = defineEmits<{
  join: [activity: ProfileOngoingVcActivity];
}>();

function handleJoinClick() {
  emit('join', props.activity);
}
</script>

<template>
  <div
    class="profile-vc-act-widget"
    role="status"
    :aria-label="echoT('b44.vcActivity.inProgress', { label: activity.label })"
  >
    <div class="profile-vc-act-widget__body">
      <div class="profile-vc-act-widget__text">
        <div class="profile-vc-act-widget__eyebrow">
          {{ echoT('b44.vcActivity.eyebrow') }}
        </div>
        <div class="profile-vc-act-widget__title">
          {{ activity.label }}
        </div>
        <div class="profile-vc-act-widget__subtitle">
          {{ echoT('b44.vcActivity.subtitle') }}
        </div>
      </div>
      <button
        v-if="joinable"
        type="button"
        class="profile-vc-act-widget__join"
        :aria-label="
          echoT('b44.vcActivity.joinLabel', { label: activity.label })
        "
        @click.stop="handleJoinClick"
      >
        {{ echoT('b44.vcActivity.join') }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss" src="./styles/ProfileVcActivityWidget.scss"></style>
