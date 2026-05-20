<script setup lang="ts">
import StatusIndicator from '@/components/StatusIndicator.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import ProfileBannerMedia from '@/components/ProfileBannerMedia.vue';
import ProfileCustomStatusThoughtBubble from '@/components/ProfileCustomStatusThoughtBubble.vue';
import type { MemberProfile } from '@/utils/memberProfiles';
import { icons } from '@/assets/icons';

defineProps<{
  profile: MemberProfile;
  bannerRefractionStyle: Record<string, string | number>;
}>();

defineEmits<{
  'open-full-profile': [];
}>();
</script>

<template>
  <div class="member-profile-header shrink-0">
    <div
      class="member-popout__banner h-24 w-full min-w-0 rounded-t-[24px]"
      :style="
        !profile.bannerImage
          ? { '--banner-background': profile.bannerColor }
          : undefined
      "
    >
      <ProfileBannerMedia
        v-if="profile.bannerImage"
        :banner-image="profile.bannerImage"
        :session-key="`${profile.id}-popout-banner`"
        :position-y="profile.bannerPositionY ?? 50"
        wrapper-class="member-popout__banner-bg absolute inset-0 z-0 overflow-hidden"
      />
      <div
        v-if="profile.bannerBlurEnabled"
        class="pointer-events-none absolute inset-0 z-[1] echo-user-banner-blur"
        aria-hidden="true"
      />
      <div
        v-if="profile.bannerBlackoutEnabled"
        class="pointer-events-none absolute inset-0 z-[2] bg-scrim-2"
        aria-hidden="true"
      />

      <div class="member-popout__banner-actions">
        <slot name="banner-actions" />
      </div>
    </div>

    <!-- Full-bleed refraction (sibling of banner, not clipped by banner overflow) — avoids “seam” compositing. -->
    <div
      v-if="profile.bannerRefractionEnabled"
      class="member-popout__refraction"
      :style="bannerRefractionStyle"
    />

    <div
      class="member-popout__hero relative -mt-8 flex min-w-0 items-end gap-2 px-4"
    >
      <div class="flex shrink-0 flex-col gap-2">
        <button
          type="button"
          class="member-popout__avatar relative h-16 w-16 shrink-0 cursor-pointer overflow-visible rounded-full border-0 p-0 focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-[var(--echo-channel-panel-bg)]"
          aria-label="Open full profile"
          @click="$emit('open-full-profile')"
        >
          <PausedGifAvatar
            :src="safeImageUrl(profile.pfp)"
            :alt="`${profile.displayName} avatar`"
            :session-key="profile.id"
            :static-only="false"
            img-class="rounded-full border-3 border-[var(--echo-channel-panel-bg)] object-cover"
          />
          <StatusIndicator :status="profile.status" size="md" />
        </button>
        <div
          v-if="profile.isDiscordShadow"
          class="flex w-fit items-center gap-1 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-indigo-400 ring-1 ring-indigo-500/25"
        >
          <img :src="icons.explore" alt="" class="h-2.5 w-2.5 filter invert" />
          Discord
        </div>
      </div>
      <div
        v-if="profile.customStatus"
        class="member-popout__status-chain flex min-w-0 flex-1 items-center pb-0.5"
      >
        <ProfileCustomStatusThoughtBubble :text="profile.customStatus" />
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@use '../expandedProfileShared.scss';

/* WebKit: rounded avatar + layered GIF can show square fringes in quick profile. */
.member-popout__avatar :deep(img) {
  clip-path: inset(0 round 9999px);
  -webkit-clip-path: inset(0 round 9999px);
}
</style>

<style scoped lang="scss">
.member-profile-header {
  position: relative;
}

.member-popout__banner {
  position: relative;
  z-index: 0;
  overflow: hidden;
  isolation: isolate;
  background: var(--banner-background);
  transform: translateZ(0);
}

.member-popout__banner-bg {
  transform: translateZ(0);
}

.member-popout__banner::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 3;
  background:
    radial-gradient(circle at top left, var(--vue-auto-037), transparent 34%),
    linear-gradient(180deg, var(--vue-auto-002), var(--vue-auto-021));
  opacity: 0.75;
  pointer-events: none;
}

.member-popout__banner::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 4;
  background: linear-gradient(
    180deg,
    var(--vue-auto-185) 0%,
    var(--vue-auto-186) 58%,
    var(--vue-auto-187) 100%
  );
  pointer-events: none;
}

/** ⋮ / Add friend — top-right on banner, above gradient overlays. */
.member-popout__banner-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 12;
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.member-popout__banner-actions > * {
  pointer-events: auto;
}

.member-popout__refraction {
  position: absolute;
  top: -22px;
  left: -22px;
  right: -22px;
  bottom: -18px;
  z-index: 0;
  pointer-events: none;
  opacity: var(--profile-banner-refraction-opacity, 0.24);
  filter: blur(28px) saturate(1.25);
  mix-blend-mode: var(--profile-banner-refraction-mix-blend-mode, screen);
  transform: translateZ(0);
}

:global([data-theme='light'] .member-popout__refraction) {
  mix-blend-mode: normal;
  opacity: 0.12;
}

/* Hero overlaps the banner (-mt-8) but uses z-index above the banner stack; without
   pointer-events: none, the full-width hit target steals clicks from the banner tag row. */
.member-popout__hero {
  z-index: 2;
  pointer-events: none;
}

.member-popout__hero > * {
  pointer-events: auto;
}

.member-popout__avatar {
  z-index: 3;
  /* Elevation on the circular button — WebKit paints square shadows on `<img>` even with `border-radius`. */
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.45),
    0 8px 10px -6px rgba(0, 0, 0, 0.35);
}

:global([data-theme='light'] .member-popout__avatar) {
  box-shadow: none;
}

.member-popout__status-chain {
  z-index: 3;
}
</style>
