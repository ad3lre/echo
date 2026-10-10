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

<style
  scoped
  lang="scss"
  src="./styles/ProfileVoiceActivityWidget.scss"
></style>
