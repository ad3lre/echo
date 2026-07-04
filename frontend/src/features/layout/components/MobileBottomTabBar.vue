<script setup lang="ts">
import { computed, ref } from 'vue';
import { icons } from '@/assets/icons';
import type { MobileBottomTabId } from '@/features/layout/mobileBottomTab';

const props = defineProps<{
  modelValue: MobileBottomTabId;
  /** Total unread DM count for Home tab badge. */
  dmUnreadTotal?: number;
  /** Whether any server has ping/unread for Servers tab badge. */
  serversHasActivity?: boolean;
  /** Whether explore has unseen activity (optional). */
  exploreHasActivity?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: MobileBottomTabId];
}>();

const barEl = ref<HTMLElement | null>(null);

defineExpose({ barEl });

const tabs = computed(() => [
  {
    id: 'home' as const,
    label: 'Home',
    icon: icons.message,
    iconActive: icons.messageFilled,
    badge: (props.dmUnreadTotal ?? 0) > 0 ? props.dmUnreadTotal : null,
  },
  {
    id: 'servers' as const,
    label: 'Servers',
    icon: icons.community,
    iconActive: icons.communityFilled,
    badge: props.serversHasActivity ? ('dot' as const) : null,
  },
  {
    id: 'explore' as const,
    label: 'Explore',
    icon: icons.exploreFilled,
    iconActive: icons.exploreFilled,
    badge: props.exploreHasActivity ? ('dot' as const) : null,
  },
]);

function selectTab(id: MobileBottomTabId) {
  if (id !== props.modelValue) emit('update:modelValue', id);
}

function formatBadge(n: number): string {
  if (n > 99) return '99+';
  return String(n);
}
</script>

<template>
  <nav
    ref="barEl"
    class="mobile-bottom-tab-bar flex shrink-0 items-stretch border-t border-border bg-[var(--echo-server-rail-bg)]"
    aria-label="Main navigation"
  >
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      class="mobile-bottom-tab-bar__tab relative flex flex-1 flex-col items-center justify-center gap-0.5 border-0 bg-transparent py-2 text-inherit transition-colors"
      :class="
        modelValue === tab.id
          ? 'mobile-bottom-tab-bar__tab--active text-[var(--accent)]'
          : 'text-muted hover:text-foreground'
      "
      :aria-current="modelValue === tab.id ? 'page' : undefined"
      :aria-label="tab.label"
      @click="selectTab(tab.id)"
    >
      <span class="relative flex h-7 w-7 items-center justify-center">
        <img
          :src="modelValue === tab.id ? tab.iconActive : tab.icon"
          alt=""
          class="h-6 w-6 object-contain"
          aria-hidden="true"
        />
        <span
          v-if="typeof tab.badge === 'number'"
          class="mobile-bottom-tab-bar__badge absolute -right-1 -top-0.5 min-w-[1.1rem] rounded-full bg-[var(--accent)] px-1 text-center text-[10px] font-bold leading-[1.1rem] text-white"
        >
          {{ formatBadge(tab.badge) }}
        </span>
        <span
          v-else-if="tab.badge === 'dot'"
          class="mobile-bottom-tab-bar__dot absolute right-0 top-0 h-2 w-2 rounded-full bg-[var(--accent)]"
          aria-hidden="true"
        />
      </span>
    </button>
  </nav>
</template>

<style scoped lang="scss">
.mobile-bottom-tab-bar {
  min-height: var(--echo-mobile-bottom-bar-height, 3.25rem);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  z-index: 40;
}

.mobile-bottom-tab-bar__tab--active {
  /* accent color applied via utility class */
}
</style>
