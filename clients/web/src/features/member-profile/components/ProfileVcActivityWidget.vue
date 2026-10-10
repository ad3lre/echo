<script setup lang="ts">
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
    :aria-label="`${activity.label} in progress`"
  >
    <div class="profile-vc-act-widget__body">
      <div class="profile-vc-act-widget__text">
        <div class="profile-vc-act-widget__eyebrow">In activity</div>
        <div class="profile-vc-act-widget__title">
          {{ activity.label }}
        </div>
        <div class="profile-vc-act-widget__subtitle">
          Join the same session as everyone in voice
        </div>
      </div>
      <button
        v-if="joinable"
        type="button"
        class="profile-vc-act-widget__join"
        :aria-label="`Join ${activity.label}`"
        @click.stop="handleJoinClick"
      >
        Join activity
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss" src="./styles/ProfileVcActivityWidget.scss"></style>
