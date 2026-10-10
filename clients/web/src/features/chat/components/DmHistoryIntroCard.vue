<script setup lang="ts">
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import StatusIndicator from '@/components/StatusIndicator.vue';
import { useCompactShell } from '@/features/layout/useCompactShell';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';

const props = defineProps<{
  title: string;
  subtitle: string;
  avatarUrl?: string;
  /** Canonical presence for the avatar status dot (1:1 DMs). */
  presenceStatus?: string;
  presenceMobileSurface?: boolean;
  /** When true, hide the status dot (group DMs). */
  hidePresence?: boolean;
  mutualCommunitiesCount?: number;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void | Promise<void>;
}>();

const { isCompactShell } = useCompactShell();
</script>

<template>
  <section
    class="dm-history-intro"
    :class="{ 'dm-history-intro--compact': isCompactShell }"
    role="region"
    aria-label="Direct message history intro"
  >
    <div class="dm-history-intro__avatar-wrap">
      <div class="dm-history-intro__avatar">
        <PausedGifAvatar
          :src="safeImageUrl(props.avatarUrl)"
          :alt="props.title"
          :session-key="props.title"
          img-class="h-full w-full rounded-full object-cover"
        />
      </div>
      <StatusIndicator
        v-if="!props.hidePresence && props.presenceStatus"
        :status="props.presenceStatus"
        :mobile-surface="props.presenceMobileSurface"
        size="lg"
        class="dm-history-intro__status"
      />
    </div>

    <h2 class="dm-history-intro__title">
      {{ props.title }}
    </h2>

    <p class="dm-history-intro__subtitle">
      {{ props.subtitle }}
    </p>

    <p
      v-if="typeof props.mutualCommunitiesCount === 'number'"
      class="dm-history-intro__meta"
    >
      {{ props.mutualCommunitiesCount }} mutual server{{
        props.mutualCommunitiesCount === 1 ? '' : 's'
      }}
    </p>

    <button
      v-if="props.primaryActionLabel && props.onPrimaryAction"
      type="button"
      class="dm-history-intro__action chat-focus-ring"
      :aria-label="props.primaryActionLabel"
      @click="props.onPrimaryAction"
    >
      {{ props.primaryActionLabel }}
    </button>
  </section>
</template>

<style scoped lang="scss" src="./styles/DmHistoryIntroCard.scss"></style>
