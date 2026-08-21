<script setup lang="ts">
import { computed } from 'vue';
import {
  isTrustedMediaUrl,
  safeImageUrl,
} from '@/features/layout/display/safeImageUrl';

/**
 * Read-only roster row for a Discord voice mirror participant. Mirrors the
 * layout/density of `ChannelPanelVoiceParticipant`, but is purely display —
 * users join voice in Discord, not in Echo.
 *
 * Discord avatars come from the bot as a fully-resolved CDN URL (or `null`
 * when the user has no custom avatar); when missing we render a deterministic
 * initials monogram so the roster still resembles a real Discord VC.
 */
const props = defineProps<{
  discordUserId: string;
  username: string;
  globalName: string | null;
  /** Discord CDN URL (or null). The bot returns the full URL, not just a hash. */
  avatar: string | null;
}>();

const displayName = computed(
  () => props.globalName?.trim() || props.username || 'Unknown',
);

const hasAvatar = computed(() => isTrustedMediaUrl(props.avatar));

const avatarSrc = computed(() => safeImageUrl(props.avatar));

/** Up to two letters from the visible name (skipping leading non-letters/digits). */
const initials = computed(() => {
  const name = displayName.value;
  const parts = name
    .split(/\s+/u)
    .map((p) => p.replace(/^[^\p{L}\p{N}]+/u, ''))
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
});

/** Stable hue per Discord user id so monograms don't all look the same. */
const monogramHue = computed(() => {
  const id = props.discordUserId || displayName.value;
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
});
</script>

<template>
  <div
    class="vc-participant-row vc-participant-row--mirror flex items-center gap-2 py-0.5 px-1 rounded-md"
    :data-discord-user-id="discordUserId"
    :title="`${displayName} · Discord voice (mirror)`"
  >
    <div
      class="vc-participant-avatar-wrap relative h-6 w-6 flex-shrink-0 rounded-full overflow-hidden"
    >
      <img
        v-if="hasAvatar"
        :src="avatarSrc"
        :alt="displayName"
        class="vc-participant-avatar rounded-full object-cover h-full w-full"
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
      />
      <div
        v-else
        class="vc-participant-monogram h-full w-full flex items-center justify-center rounded-full text-[9px] font-semibold uppercase tracking-wide"
        :style="{
          backgroundColor: `hsl(${monogramHue} 55% 28%)`,
          color: `hsl(${monogramHue} 80% 90%)`,
        }"
        aria-hidden="true"
      >
        {{ initials }}
      </div>
    </div>
    <span
      class="vc-participant-name text-[11px] truncate flex-1 min-w-0 text-fg-soft"
    >
      {{ displayName }}
    </span>
  </div>
</template>

<style scoped lang="scss">
@use '@/features/channel-panel/styles/channelPanelListParticipant.scss';

/* Discord-blurple accent to distinguish display-only mirror rows from native VC. */
.vc-participant-row--mirror {
  cursor: default;
}
</style>
