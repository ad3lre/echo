<script setup lang="ts">
import { computed } from 'vue';
import StatusIndicator from '@/components/StatusIndicator.vue';
import { presenceIndicatorTitle } from '@/services/domain/presence';
import { safeImageUrl } from '@/utils/safeImageUrl';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';

const props = defineProps<{
  currentUser: { id: string; name: string; pfp: string; status?: string };
  /** Self-user on mobile-class Echo Web — handset status glyph. */
  mobileSurface?: boolean;
  /** Bug Hunter: show report control above the avatar. */
  bugHunterEnabled?: boolean;
  /** In voice/call but main UI is not that thread/server — show speaking ring on rail PFP. */
  awaySelfSpeaking?: boolean;
  /** Top horizontal action strip — anchor profile at trailing edge of the bar. */
  horizontalRail?: boolean;
  /** When true (top rail), only the avatar is shown — actions live in the centered cluster. */
  profileOnly?: boolean;
}>();

const emit = defineEmits<{
  'open-self-profile': [event: MouseEvent];
  'open-bug-report': [];
}>();

const profileHoverTitle = computed(() => {
  const name = props.currentUser.name?.trim() || 'Your profile';
  if (!props.currentUser.status) return name;
  const status = presenceIndicatorTitle({
    status: props.currentUser.status,
    mobileSurface: props.mobileSurface,
  });
  return `${name} — ${status}`;
});
</script>

<template>
  <div
    class="rail-profile pointer-events-none z-10 flex items-center gap-1"
    :class="
      horizontalRail
        ? 'relative h-full min-h-[60px] shrink-0 flex-row items-center border-l border-border pl-4 pr-5 py-2.5'
        : 'absolute inset-x-0 bottom-0 flex-col justify-center px-0 pb-4'
    "
  >
    <button
      v-if="bugHunterEnabled && !profileOnly"
      type="button"
      class="rail-bug-hunter pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-amber-500/35 bg-amber-500/15 text-amber-200 shadow-md transition hover:bg-amber-500/25 hover:brightness-110"
      title="Report a bug"
      aria-label="Report a bug"
      @click.stop="emit('open-bug-report')"
    >
      <span class="text-[13px] leading-none" aria-hidden="true">🐛</span>
    </button>
    <div
      class="rail-profile__avatar pointer-events-auto relative h-10 w-10 shrink-0"
      :class="{ 'rail-profile__avatar--away-speaking': awaySelfSpeaking }"
      :title="profileHoverTitle"
      aria-label="Current profile"
      @click="emit('open-self-profile', $event)"
    >
      <span class="rail-profile__glow" aria-hidden="true" />
      <span class="rail-profile__sheen" aria-hidden="true" />
      <div class="rail-profile__face">
        <PausedGifAvatar
          :src="safeImageUrl(currentUser.pfp)"
          :alt="`${currentUser.name} profile picture`"
          :session-key="currentUser.id"
          img-class="rail-profile__image h-full w-full rounded-full object-cover"
        />
        <StatusIndicator
          v-if="currentUser.status"
          :status="currentUser.status"
          :mobile-surface="mobileSurface"
          size="md"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.rail-profile__avatar {
  isolation: isolate;
  cursor: pointer;
  transition: transform 160ms ease-out;
  animation: rail-profile-idle 5.8s cubic-bezier(0.37, 0, 0.2, 1) infinite;
}

.rail-profile__avatar:hover {
  transform: translateY(-2px) scale(1.04);
  animation-play-state: paused;
}

.rail-profile__avatar::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 9999px;
  border: 1px solid var(--vue-auto-001);
  pointer-events: none;
  z-index: 4;
  transition:
    border-color 0.12s ease-out,
    box-shadow 0.12s ease-out;
}

.rail-profile__avatar--away-speaking::after {
  border-color: rgb(16 185 129 / 0.88);
  box-shadow:
    0 0 0 2px rgb(16 185 129 / 0.2),
    0 0 14px rgb(16 185 129 / 0.35);
}

/** PFP + status share one 40×40 positioning context (status sits on bottom-right rim). */
.rail-profile__face {
  position: relative;
  z-index: 3;
  width: 100%;
  height: 100%;
  border-radius: 9999px;
  overflow: visible;
  box-shadow:
    0 8px 18px var(--vue-auto-277),
    0 0 0 1px var(--vue-auto-007);
  transition: box-shadow 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.rail-profile__image {
  display: block;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  transition:
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.rail-profile__avatar:hover .rail-profile__face {
  box-shadow:
    0 14px 28px var(--vue-auto-278),
    0 0 0 1px var(--vue-auto-001);
}

.rail-profile__avatar:hover .rail-profile__image {
  transform: scale(1.03);
  filter: saturate(1.04) brightness(1.03);
}

/* Light theme: no elevation shadow under the rail PFP — pale chrome already separates it. */
[data-theme='light'] .rail-profile__avatar .rail-profile__face {
  box-shadow: 0 0 0 1px var(--vue-auto-007);
}

[data-theme='light'] .rail-profile__avatar:hover .rail-profile__face {
  box-shadow: 0 0 0 1px var(--vue-auto-001);
}

.rail-profile__glow,
.rail-profile__sheen {
  position: absolute;
  inset: -6px;
  border-radius: 9999px;
  pointer-events: none;
}

.rail-profile__glow {
  z-index: 0;
  background:
    radial-gradient(circle at 30% 25%, var(--vue-auto-279), transparent 45%),
    radial-gradient(circle at 72% 78%, var(--vue-auto-280), transparent 48%);
  opacity: 0.55;
  filter: blur(10px);
  animation: rail-profile-glow 5.8s ease-in-out infinite;
}

/* Firefox: avoid always-on decorative rail animations that can trigger idle jank. */
@supports (-moz-appearance: none) {
  .rail-profile__avatar {
    animation: none;
  }

  .rail-profile__glow {
    animation: none;
    filter: blur(6px);
    opacity: 0.46;
  }
}

.rail-profile__sheen {
  z-index: 2;
  inset: -2px;
  background: linear-gradient(
    135deg,
    var(--vue-auto-021) 18%,
    var(--vue-auto-004) 36%,
    var(--vue-auto-281) 48%,
    var(--vue-auto-001) 60%,
    var(--vue-auto-021) 78%
  );
  mix-blend-mode: screen;
  opacity: 0.22;
  transform: translateX(-16%) rotate(10deg);
  transition:
    opacity 220ms ease-out,
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.rail-profile__avatar:hover .rail-profile__sheen {
  opacity: 0.42;
  transform: translateX(6%) rotate(10deg);
}

.rail-profile__face :deep(.status-indicator) {
  z-index: 5;
  right: -1px;
  bottom: -1px;
  left: auto;
  top: auto;
  pointer-events: none;
}

@keyframes rail-profile-idle {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-1.5px) scale(1.012);
  }
}

@keyframes rail-profile-glow {
  0%,
  100% {
    opacity: 0.42;
    transform: scale(0.96);
  }
  50% {
    opacity: 0.68;
    transform: scale(1.04);
  }
}
</style>
