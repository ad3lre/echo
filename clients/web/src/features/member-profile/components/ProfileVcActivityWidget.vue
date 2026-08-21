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

<style scoped lang="scss">
.profile-vc-act-widget {
  display: flex;
  width: 100%;
  flex-direction: column;
  border-radius: 16px;
  padding: 0.78rem 0.92rem;
  background:
    radial-gradient(
      circle at top right,
      rgba(120, 140, 255, 0.2),
      transparent 48%
    ),
    linear-gradient(135deg, rgba(48, 58, 120, 0.45), rgba(12, 16, 28, 0.94));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 10px 24px rgba(0, 0, 0, 0.16);
}

.profile-vc-act-widget__body {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.profile-vc-act-widget__text {
  min-width: 0;
  flex: 1 1 auto;
}

.profile-vc-act-widget__eyebrow {
  color: color-mix(in srgb, var(--muted) 82%, #a8b4ff 18%);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-vc-act-widget__title {
  overflow: hidden;
  margin-top: 0.2rem;
  color: var(--text);
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-vc-act-widget__subtitle {
  overflow: hidden;
  margin-top: 0.16rem;
  color: color-mix(in srgb, var(--muted) 90%, var(--text) 10%);
  font-size: 0.72rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-vc-act-widget__join {
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  padding: 0.5rem 0.85rem;
  background: linear-gradient(135deg, #7b8cff, #5a6dee);
  color: #0a1024;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  transition:
    transform 120ms ease,
    box-shadow 120ms ease,
    filter 120ms ease;
  box-shadow: 0 10px 22px rgba(90, 109, 238, 0.28);

  &:hover {
    transform: translateY(-1px);
    filter: brightness(1.04);
    box-shadow: 0 12px 26px rgba(90, 109, 238, 0.34);
  }
}

[data-theme='light'] .profile-vc-act-widget {
  background:
    radial-gradient(
      circle at top right,
      rgba(99, 102, 241, 0.14),
      transparent 50%
    ),
    linear-gradient(
      135deg,
      rgba(244, 246, 255, 0.98),
      rgba(236, 240, 255, 0.98)
    );
  border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
}
</style>
