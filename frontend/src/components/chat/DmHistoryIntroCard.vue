<script setup lang="ts">
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';

const props = defineProps<{
  title: string;
  subtitle: string;
  /** Optional line under the subtitle (e.g. composer nudge). */
  helloNudge?: string;
  avatarUrl?: string;
  statusNugget?: string;
  mutualCommunitiesCount?: number;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void | Promise<void>;
}>();
</script>

<template>
  <section
    class="dm-history-intro rounded-2xl p-4 sm:p-5"
    role="region"
    aria-label="Direct message history intro"
  >
    <div class="flex items-start gap-3">
      <div class="relative h-12 w-12 shrink-0 overflow-hidden rounded-full">
        <PausedGifAvatar
          :src="safeImageUrl(props.avatarUrl)"
          :alt="props.title"
          :session-key="props.title"
          img-class="h-full w-full rounded-full object-cover"
        />
      </div>
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-base font-semibold text-white">
          {{ props.title }}
        </h2>
        <p class="mt-0.5 text-xs text-fg-soft">
          {{ props.subtitle }}
        </p>
        <p
          v-if="props.helloNudge?.trim()"
          class="mt-2 text-xs leading-relaxed text-fg-subtle"
        >
          {{ props.helloNudge.trim() }}
        </p>
      </div>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <span
        v-if="props.statusNugget"
        class="inline-flex max-w-full truncate rounded-full bg-glass-2 px-2.5 py-1 text-[11px] font-medium text-fg-soft"
        :title="props.statusNugget"
        :data-echo-hint="props.statusNugget"
      >
        {{ props.statusNugget }}
      </span>
      <span
        v-if="typeof props.mutualCommunitiesCount === 'number'"
        class="inline-flex rounded-full bg-glass-2 px-2.5 py-1 text-[11px] font-medium text-fg-soft"
        :data-echo-hint="`${props.mutualCommunitiesCount} mutual communities`"
      >
        {{ props.mutualCommunitiesCount }} mutual communities
      </span>
      <button
        v-if="props.primaryActionLabel && props.onPrimaryAction"
        type="button"
        class="chat-focus-ring inline-flex rounded-full bg-glass-2 px-3 py-1.5 text-[11px] font-semibold text-fg transition-colors hover:bg-glass-hover"
        :aria-label="props.primaryActionLabel"
        :title="props.primaryActionLabel"
        :data-echo-hint="props.primaryActionLabel"
        @click="props.onPrimaryAction"
      >
        {{ props.primaryActionLabel }}
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.dm-history-intro {
  background:
    radial-gradient(
      140% 120% at 0% 0%,
      color-mix(in srgb, #7c83ff 20%, transparent) 0%,
      transparent 58%
    ),
    linear-gradient(
      140deg,
      color-mix(in srgb, white 7%, transparent) 0%,
      color-mix(in srgb, white 3%, transparent) 100%
    );
}
</style>
