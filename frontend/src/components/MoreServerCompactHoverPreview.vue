<script setup lang="ts">
import { computed } from 'vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import type { MoreServersMockServer } from '@/composables/useMoreServers';
import type { CompactHoverAnchor } from '@/composables/useMoreServerCompactHoverPreview';

const props = defineProps<{
  server: MoreServersMockServer;
  anchor: CompactHoverAnchor;
}>();

const popoverStyle = computed(() => {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
  const width = 248;
  const height = 200;
  let left = props.anchor.left;
  let top = props.anchor.top - height / 2;
  if (left + width > vw - 8) {
    left = Math.max(8, props.anchor.left - width - props.anchor.height - 20);
  }
  top = Math.max(8, Math.min(top, vh - height - 8));
  return { left: `${left}px`, top: `${top}px` };
});

const bannerStyle = computed(() => {
  const heroSrc = props.server.bannerImageUrl?.trim() || props.server.icon;
  return {
    backgroundImage: `url(${safeImageUrl(serverGuildIconDisplayUrl(heroSrc))})`,
    backgroundPosition: `center ${props.server.bannerPositionY ?? 50}%`,
  };
});

const hasStats = computed(
  () =>
    Boolean(props.server.online?.trim()) ||
    Boolean(props.server.members?.trim()),
);

const description = computed(() => props.server.description?.trim() ?? '');
</script>

<template>
  <div
    class="more-compact-preview pointer-events-none fixed z-[220] w-[15.5rem] overflow-hidden rounded-xl border shadow-xl"
    :style="popoverStyle"
    role="tooltip"
  >
    <div
      class="more-compact-preview__banner h-[4.5rem] w-full shrink-0 bg-cover bg-no-repeat"
      :style="bannerStyle"
    />
    <div class="more-compact-preview__body px-3 pb-3 pt-2">
      <div class="flex items-center gap-2.5">
        <PausedGifAvatar
          :src="serverGuildIconDisplayUrl(server.icon)"
          :alt="server.name"
          img-class="h-10 w-10 shrink-0 rounded-xl object-cover"
        />
        <div class="min-w-0 flex-1">
          <p
            class="truncate text-sm font-semibold leading-tight text-fg"
            :title="server.name"
          >
            {{ server.name }}
          </p>
          <div
            v-if="hasStats"
            class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-fg-subtle"
          >
            <span v-if="server.online" class="inline-flex items-center gap-1">
              <span
                class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
                aria-hidden="true"
              />
              {{ server.online }} online
            </span>
            <span v-if="server.online && server.members" aria-hidden="true"
              >·</span
            >
            <span v-if="server.members">{{ server.members }} members</span>
          </div>
        </div>
      </div>
      <p
        v-if="description"
        class="more-compact-preview__desc mt-2 text-[11px] leading-snug text-fg-soft line-clamp-3"
      >
        {{ description }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.more-compact-preview {
  border-color: color-mix(in srgb, var(--border) 70%, transparent);
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  backdrop-filter: blur(12px);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--text) 6%, transparent),
    0 12px 32px color-mix(in srgb, black 28%, transparent);
}

.more-compact-preview__banner {
  mask-image: linear-gradient(to bottom, black 70%, transparent);
}

.more-compact-preview__body {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface) 88%, transparent),
    var(--surface)
  );
}

[data-theme='light'] .more-compact-preview {
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--text) 10%, transparent),
    0 10px 28px color-mix(in srgb, black 12%, transparent);
}
</style>
