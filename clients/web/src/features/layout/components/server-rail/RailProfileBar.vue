<script setup lang="ts">
import { computed } from 'vue';
import StatusIndicator from '@/components/StatusIndicator.vue';
import { presenceIndicatorTitle } from '@/features/layout/presence';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';

const props = defineProps<{
  currentUser: { id: string; name: string; pfp: string; status?: string };
  /** Self-user on mobile-class Echo Web — handset status glyph. */
  mobileSurface?: boolean;
  /** Bug Hunter: show report control above the avatar. */
  bugHunterEnabled?: boolean;
  /** In server/voice/call but main UI is not that thread/server — show speaking ring on rail PFP. */
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
        ? 'rail-profile--horizontal relative h-full min-h-[60px] shrink-0 flex-row items-center border-l border-border pl-4 pr-5 py-2.5'
        : 'absolute inset-x-0 bottom-0 flex-col justify-center px-0 rail-profile--vertical'
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

<style scoped lang="scss" src="./styles/RailProfileBar.scss"></style>
