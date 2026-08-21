<script setup lang="ts">
import { computed } from 'vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';
import {
  formatVoiceChannelLabel,
  type UserVoiceChannelPresence,
} from '@/features/member-profile/userVoiceChannelPresence';

const props = defineProps<{
  activities: UserVoiceChannelPresence[];
  /** Slightly tighter padding when nested in the small member popout. */
  compact?: boolean;
  /** Show a join CTA for the primary voice activity. */
  joinable?: boolean;
}>();

const emit = defineEmits<{
  join: [activity: UserVoiceChannelPresence];
}>();

const primary = computed(() => props.activities[0] ?? null);
const extraCount = computed(() => Math.max(0, props.activities.length - 1));

const channelLabel = computed(() =>
  primary.value ? formatVoiceChannelLabel(primary.value.channelName) : '',
);
const widgetBgStyle = computed(() => {
  const b = primary.value?.serverBannerImageUrl?.trim();
  if (!b) return undefined;
  return {
    backgroundImage: `linear-gradient(135deg, var(--profile-vc-overlay-start), var(--profile-vc-overlay-end)), url(${safeImageUrl(
      b,
    )})`,
  } as const;
});
const participantPfps = computed(() => {
  const ids = primary.value?.participantUserIds ?? [];
  const pfps = primary.value?.participantPfps ?? [];
  if (!ids.length || !pfps.length) return [];
  return pfps.filter((v) => !!v.trim());
});
const visibleParticipantPfps = computed(() =>
  participantPfps.value.slice(0, 4),
);
const participantOverflow = computed(() =>
  Math.max(
    0,
    (primary.value?.participantUserIds?.length ?? 0) -
      visibleParticipantPfps.value.length,
  ),
);

const showJoinAction = computed(
  () => !!primary.value && !!props.joinable && !props.compact,
);

function handleJoinClick() {
  if (!primary.value) return;
  emit('join', primary.value);
}
</script>

<template>
  <div
    v-if="primary"
    class="profile-vc-widget"
    :class="{
      'profile-vc-widget--compact': compact,
      'profile-vc-widget--joinable': showJoinAction,
    }"
    :style="widgetBgStyle"
    role="status"
    :aria-label="`In voice channel ${channelLabel} in ${primary.serverName}`"
  >
    <div v-if="extraCount > 0" class="profile-vc-widget__eyebrow">
      <span class="profile-vc-widget__extra">+{{ extraCount }} more</span>
    </div>

    <div class="profile-vc-widget__body">
      <div class="profile-vc-widget__text">
        <div class="profile-vc-widget__channel">
          {{ channelLabel }}
        </div>
        <div class="profile-vc-widget__server">
          {{ primary.serverName }}
        </div>
      </div>

      <button
        v-if="showJoinAction"
        type="button"
        class="profile-vc-widget__join"
        :aria-label="`Join ${channelLabel} in ${primary.serverName}`"
        @click.stop="handleJoinClick"
      >
        Join
      </button>
    </div>

    <div
      v-if="visibleParticipantPfps.length"
      class="profile-vc-widget__participants"
      :aria-label="`${primary.participantUserIds.length} people in voice`"
    >
      <div class="profile-vc-widget__avatar-stack">
        <div
          v-for="(pfp, idx) in visibleParticipantPfps"
          :key="`vc-p-${idx}`"
          class="profile-vc-widget__avatar"
          :style="{ zIndex: 10 - idx }"
        >
          <PausedGifAvatar
            :src="safeImageUrl(pfp)"
            alt=""
            :session-key="`vc-widget-${idx}`"
            img-class="h-full w-full rounded-full object-cover"
          />
        </div>
      </div>
      <span class="profile-vc-widget__participants-count">
        {{ primary.participantUserIds.length }}
        in channel
      </span>
      <span
        v-if="participantOverflow > 0"
        class="profile-vc-widget__participants-overflow"
      >
        +{{ participantOverflow }}
      </span>
    </div>

    <div
      v-if="!showJoinAction && extraCount === 0"
      class="profile-vc-widget__footer"
    >
      Active now
    </div>
    <div v-else-if="!showJoinAction" class="profile-vc-widget__footer">
      {{ channelLabel }} in {{ primary.serverName }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.profile-vc-widget {
  --profile-vc-overlay-start: rgba(8, 15, 20, 0.84);
  --profile-vc-overlay-end: rgba(10, 18, 21, 0.92);
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 0.72rem;
  border-radius: 18px;
  padding: 0.9rem 1rem;
  background:
    radial-gradient(
      circle at top right,
      rgba(143, 255, 207, 0.16),
      transparent 42%
    ),
    linear-gradient(135deg, rgba(40, 103, 82, 0.42), rgba(12, 19, 21, 0.94));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 14px 32px rgba(0, 0, 0, 0.18);
  text-align: left;
  background-size: cover;
  background-position: center;
}

.profile-vc-widget__eyebrow {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.profile-vc-widget__extra {
  flex-shrink: 0;
  color: color-mix(in srgb, var(--muted) 88%, var(--text) 12%);
  font-size: 0.74rem;
  font-weight: 600;
}

.profile-vc-widget__body {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.profile-vc-widget__text {
  min-width: 0;
  flex: 1 1 auto;
}

.profile-vc-widget__channel {
  overflow: hidden;
  color: var(--text);
  font-size: 0.94rem;
  font-weight: 700;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-vc-widget__server {
  overflow: hidden;
  margin-top: 0.18rem;
  color: color-mix(in srgb, var(--muted) 90%, var(--text) 10%);
  font-size: 0.77rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-vc-widget__join {
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  padding: 0.55rem 0.95rem;
  background: linear-gradient(135deg, #58d89b, #2fbf85);
  color: #092118;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  transition:
    transform 120ms ease,
    box-shadow 120ms ease,
    filter 120ms ease;
  box-shadow: 0 10px 24px rgba(47, 191, 133, 0.22);

  &:hover {
    transform: translateY(-1px);
    filter: brightness(1.03);
    box-shadow: 0 12px 28px rgba(47, 191, 133, 0.28);
  }
}

.profile-vc-widget__footer {
  color: color-mix(in srgb, var(--muted) 92%, var(--text) 8%);
  font-size: 0.73rem;
}

.profile-vc-widget__participants {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.profile-vc-widget__avatar-stack {
  display: flex;
  align-items: center;
}

.profile-vc-widget__avatar {
  height: 1.25rem;
  width: 1.25rem;
  overflow: hidden;
  border-radius: 999px;
  margin-left: -0.35rem;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.32);
}

.profile-vc-widget__avatar:first-child {
  margin-left: 0;
}

.profile-vc-widget__participants-count {
  color: color-mix(in srgb, var(--muted) 86%, var(--text) 14%);
  font-size: 0.72rem;
  font-weight: 600;
}

.profile-vc-widget__participants-overflow {
  color: color-mix(in srgb, var(--muted) 90%, var(--text) 10%);
  font-size: 0.7rem;
  font-weight: 700;
}

.profile-vc-widget--compact {
  gap: 0.5rem;
  border-radius: 14px;
  padding: 0.68rem 0.8rem;
}

.profile-vc-widget--compact .profile-vc-widget__channel {
  font-size: 0.83rem;
}

.profile-vc-widget--compact .profile-vc-widget__server,
.profile-vc-widget--compact .profile-vc-widget__footer {
  font-size: 0.7rem;
}

.profile-vc-widget--compact .profile-vc-widget__body {
  display: block;
}

.profile-vc-widget--compact .profile-vc-widget__server {
  margin-top: 0.14rem;
}

.profile-vc-widget--compact .profile-vc-widget__extra {
  font-size: 0.69rem;
}

[data-theme='light'] .profile-vc-widget {
  --profile-vc-overlay-start: rgba(248, 252, 255, 0.92);
  --profile-vc-overlay-end: rgba(241, 248, 255, 0.95);
  background:
    radial-gradient(
      circle at top right,
      rgba(79, 70, 229, 0.12),
      transparent 46%
    ),
    linear-gradient(
      135deg,
      rgba(244, 250, 255, 0.97),
      rgba(236, 246, 255, 0.98)
    );
  border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.88),
    0 10px 24px rgba(20, 26, 36, 0.09);
}

[data-theme='light'] .profile-vc-widget {
  color: var(--text);
}

[data-theme='light'] .profile-vc-widget__channel {
  color: var(--text);
}

[data-theme='light'] .profile-vc-widget__server,
[data-theme='light'] .profile-vc-widget__extra,
[data-theme='light'] .profile-vc-widget__participants-count,
[data-theme='light'] .profile-vc-widget__participants-overflow,
[data-theme='light'] .profile-vc-widget__footer {
  color: color-mix(in srgb, var(--muted) 88%, var(--text) 12%);
}

[data-theme='light'] .profile-vc-widget__avatar {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent);
}
</style>
