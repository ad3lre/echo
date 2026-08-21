<script setup lang="ts">
import { computed } from 'vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { isGuildMemberProfileContext } from '@/features/member-profile/memberProfiles';
import { serverGuildIconDisplayUrl } from '@/features/layout/display/serverGuildIconDisplayUrl';

const props = defineProps<{
  /** Locale-formatted membership / account date label. */
  date: string;
  /**
   * Profile server label from `MemberProfile.serverName`.
   * `Direct Messages` / empty → calendar icon (join row is not tied to a guild surface).
   */
  serverName?: string;
  /** Guild CDN URL when `serverName` is a real guild; optional — display util supplies default artwork. */
  serverImageUrl?: string | null;
}>();

const showGuildIcon = computed(() =>
  isGuildMemberProfileContext(props.serverName),
);

const guildIconSrc = computed(() =>
  serverGuildIconDisplayUrl(props.serverImageUrl),
);

const guildIconAlt = computed(() => {
  const n = props.serverName?.trim();
  return n ? `${n} server icon` : 'Server icon';
});
</script>

<template>
  <div class="profile-member-since-inline">
    <PausedGifAvatar
      v-if="showGuildIcon"
      class="profile-member-since-inline__guild-icon"
      :src="guildIconSrc"
      :alt="guildIconAlt"
    />
    <svg
      v-else
      class="profile-member-since-inline__icon"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        stroke="currentColor"
        stroke-width="1.65"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"
      />
    </svg>
    <span class="profile-member-since-inline__label">Member since</span>
    <span class="profile-member-since-inline__date">{{ date }}</span>
  </div>
</template>

<style scoped>
.profile-member-since-inline {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.35rem;
  font-size: 11px;
  color: var(--vue-auto-033);
}

.profile-member-since-inline__guild-icon {
  width: 0.9rem;
  height: 0.9rem;
  min-width: 0.9rem;
  flex-shrink: 0;
  border-radius: 34%;
  overflow: hidden;
  opacity: 0.88;
}

.profile-member-since-inline__icon {
  width: 0.9rem;
  height: 0.9rem;
  flex-shrink: 0;
  opacity: 0.72;
}

.profile-member-since-inline__label {
  font-weight: 500;
  color: var(--vue-auto-033);
  opacity: 0.64;
}

.profile-member-since-inline__date {
  font-weight: 500;
  color: var(--vue-auto-033);
  opacity: 0.76;
}
</style>
