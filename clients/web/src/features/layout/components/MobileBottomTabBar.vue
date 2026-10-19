<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, ref } from 'vue';
import { iconsCritical as icons } from '@/assets/iconsCritical';
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
    label: echoT('layout.tabs.home'),
    icon: icons.message,
    iconActive: icons.messageFilled,
    badge: (props.dmUnreadTotal ?? 0) > 0 ? props.dmUnreadTotal : null,
  },
  {
    id: 'servers' as const,
    label: echoT('layout.tabs.servers'),
    icon: icons.community,
    iconActive: icons.communityFilled,
    badge: props.serversHasActivity ? ('dot' as const) : null,
  },
  {
    id: 'explore' as const,
    label: echoT('layout.tabs.explore'),
    icon: icons.explore,
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
  <div ref="barEl" class="mobile-bottom-tab-bar">
    <nav
      class="mobile-bottom-tab-bar__pill echo-dark-chrome"
      :aria-label="echoT('layout.tabs.mainNavigation')"
    >
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="mobile-bottom-tab-bar__tab"
        :class="{ 'mobile-bottom-tab-bar__tab--active': modelValue === tab.id }"
        :aria-label="tab.label"
        :aria-current="modelValue === tab.id ? 'page' : undefined"
        @click="selectTab(tab.id)"
      >
        <span class="mobile-bottom-tab-bar__icon-wrap">
          <img
            :src="modelValue === tab.id ? tab.iconActive : tab.icon"
            alt=""
            class="mobile-bottom-tab-bar__icon echo-ink-icon h-[1.375rem] w-[1.375rem] object-contain"
            aria-hidden="true"
          />
          <span
            v-if="typeof tab.badge === 'number'"
            class="mobile-bottom-tab-bar__badge"
          >
            {{ formatBadge(tab.badge) }}
          </span>
          <span
            v-else-if="tab.badge === 'dot'"
            class="mobile-bottom-tab-bar__dot"
            aria-hidden="true"
          />
        </span>
      </button>
    </nav>
  </div>
</template>

<style scoped lang="scss" src="./styles/MobileBottomTabBar.scss"></style>
