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

<style scoped lang="scss">
.dm-history-intro {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 26rem;
  margin-inline: auto;
  padding: 0.75rem 0.5rem 1.25rem;
  text-align: center;
}

.dm-history-intro--compact {
  padding-top: 0.5rem;
}

.dm-history-intro__avatar-wrap {
  position: relative;
  flex-shrink: 0;
  margin-bottom: 0.85rem;
}

.dm-history-intro__avatar {
  width: 5rem;
  height: 5rem;
  overflow: hidden;
  border-radius: 9999px;
}

.dm-history-intro__status {
  /* Discord-style: status sits on the avatar ring, not a separate pill. */
  bottom: -0.05rem;
  right: -0.05rem;
}

.dm-history-intro__title {
  margin: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
  color: var(--foreground);
}

.dm-history-intro__subtitle {
  margin: 0.5rem 0 0;
  max-width: 100%;
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--fg-subtle);
}

.dm-history-intro__meta {
  margin: 0.65rem 0 0;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--fg-soft);
}

.dm-history-intro__action {
  margin-top: 1rem;
  min-height: 2.375rem;
  border: none;
  border-radius: 4px;
  padding: 0.45rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.25;
  color: #fff;
  background: #248046;
  transition: background-color 0.15s ease;

  &:hover {
    background: #1a6334;
  }

  &:active {
    background: #145028;
  }
}
</style>
