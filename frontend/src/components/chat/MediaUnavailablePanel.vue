<script setup lang="ts">
import { computed } from 'vue';
import { openExternal } from '@/platform/desktopBridge';

const props = withDefaults(
  defineProps<{
    /** Short label, e.g. "Video unavailable" */
    headline: string;
    /** Secondary line; default explains missing / server issues */
    detail?: string;
    /** If set, show "Open link" to this URL (already safe to use as href) */
    href?: string;
    /** Tighter padding for thumbnails / compact embeds */
    compact?: boolean;
    /**
     * Fills a small circular slot (pfps): icon only, no body copy; label is screen-reader only.
     */
    variant?: 'default' | 'avatar';
  }>(),
  {
    detail:
      'This file could not be loaded. It may be missing, moved, or no longer accessible.',
    href: '',
    compact: false,
    variant: 'default',
  },
);

const showLink = computed(
  () => props.variant !== 'avatar' && Boolean(props.href?.trim()),
);

async function openHref() {
  const h = props.href?.trim();
  if (!h) return;
  await openExternal(h);
}
</script>

<template>
  <div
    v-if="variant === 'avatar'"
    class="media-unavailable media-unavailable--avatar flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-hidden rounded-full bg-glass-2 text-fg-subtle"
    role="img"
    :aria-label="headline"
  >
    <span class="sr-only">{{ headline }}</span>
    <svg
      class="h-[42%] w-[42%] max-h-7 max-w-7 min-h-3 min-w-3 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.75"
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 20h16M8 4h.01M12 4h.01M16 4h.01"
      />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.75"
        d="M18 6L6 18"
      />
    </svg>
  </div>
  <div
    v-else
    class="media-unavailable flex flex-col gap-2 rounded-lg border border-white/[0.1] bg-scrim-2 text-left text-fg ring-1 ring-inset ring-white/[0.04]"
    :class="compact ? 'p-2.5' : 'p-4'"
    role="status"
    :aria-label="headline"
  >
    <div class="flex items-start gap-2.5">
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-glass-2 text-fg-subtle"
        aria-hidden="true"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.75"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 20h16M8 4h.01M12 4h.01M16 4h.01"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.75"
            d="M18 6L6 18"
          />
        </svg>
      </div>
      <div class="min-w-0 flex-1 space-y-1">
        <div class="text-sm font-semibold leading-snug text-fg">
          {{ headline }}
        </div>
        <p v-if="detail" class="text-xs leading-snug text-fg-soft">
          {{ detail }}
        </p>
      </div>
    </div>
    <!-- span (not <a>) so this panel can sit inside message <button>s / embed <a> without invalid nesting -->
    <span
      v-if="showLink"
      role="link"
      tabindex="0"
      class="inline-flex w-fit cursor-pointer items-center gap-1 text-xs font-medium text-[#00a8fc] hover:underline"
      @click.stop="openHref"
      @keydown.enter.prevent.stop="openHref"
      @keydown.space.prevent.stop="openHref"
    >
      Open link
      <span class="text-fg-subtle" aria-hidden="true">↗</span>
    </span>
  </div>
</template>
