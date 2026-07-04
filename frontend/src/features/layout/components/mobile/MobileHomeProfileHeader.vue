<script setup lang="ts">
import { computed, inject, unref } from 'vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import StatusIndicator from '@/components/StatusIndicator.vue';
import { presenceIndicatorTitle } from '@/services/domain/presence';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { getPopoutAnchorRect } from '@/utils/memberProfiles';
import { LAYOUT_LEFT_CHROME_KEY } from '@/features/layout/layoutInjectionKeys';
import { icons } from '@/assets/icons';

const layoutLeft = inject(LAYOUT_LEFT_CHROME_KEY, null);

const currentUser = computed(
  () => unref(layoutLeft?.currentUserForServerList) ?? null,
);
const mobileSurface = computed(() => {
  const map = unref(layoutLeft?.presenceMobileByUserId) ?? {};
  return !!map[currentUser.value?.id ?? ''];
});

const profileTitle = computed(() => {
  const user = currentUser.value;
  if (!user) return 'Your profile';
  const name = user.name?.trim() || 'Your profile';
  if (!user.status) return name;
  const status = presenceIndicatorTitle({
    status: user.status,
    mobileSurface: mobileSurface.value,
  });
  return `${name} — ${status}`;
});

function openProfile(event: MouseEvent) {
  layoutLeft?.onOpenSelfProfile?.(
    getPopoutAnchorRect(event.currentTarget, 'self-bar'),
  );
}

function openSettings() {
  layoutLeft?.onOpenSettings?.();
}
</script>

<template>
  <header
    v-if="currentUser"
    class="mobile-home-profile flex shrink-0 items-center gap-3 border-b border-border px-4 py-3"
  >
    <button
      type="button"
      class="relative h-12 w-12 shrink-0 overflow-hidden rounded-full ring-2 ring-transparent transition hover:ring-accent/40"
      :title="profileTitle"
      aria-label="Open your profile"
      @click="openProfile"
    >
      <PausedGifAvatar
        :src="safeImageUrl(currentUser.pfp)"
        :alt="`${currentUser.name} profile picture`"
        :session-key="currentUser.id"
        img-class="h-full w-full rounded-full object-cover"
      />
      <StatusIndicator
        v-if="currentUser.status"
        :status="currentUser.status"
        :mobile-surface="mobileSurface"
        size="md"
      />
    </button>
    <div class="min-w-0 flex-1">
      <div class="truncate text-base font-bold text-foreground">
        {{ currentUser.name }}
      </div>
      <div v-if="currentUser.status" class="truncate text-xs text-fg-soft">
        {{
          presenceIndicatorTitle({
            status: currentUser.status,
            mobileSurface: mobileSurface,
          })
        }}
      </div>
    </div>
    <button
      type="button"
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-glass-1 text-fg-soft transition hover:bg-glass-hover hover:text-foreground"
      title="Settings"
      aria-label="Open settings"
      @click="openSettings"
    >
      <img
        :src="icons.settings"
        alt=""
        class="h-4 w-4 opacity-80"
        aria-hidden="true"
      />
    </button>
  </header>
</template>
