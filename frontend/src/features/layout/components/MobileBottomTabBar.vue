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
      aria-label="Main navigation"
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

<style scoped lang="scss">
.mobile-bottom-tab-bar {
  --echo-mobile-tab-bar-pill-bg-fallback: color-mix(
    in srgb,
    #0c0d12 92%,
    transparent
  );
  --echo-mobile-tab-bar-pill-bg: color-mix(in srgb, #0c0d12 74%, transparent);

  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 50;
  display: flex;
  justify-content: center;
  padding-inline: 1rem;
  padding-bottom: calc(
    var(--echo-mobile-bottom-bar-float-gap, 0.625rem) +
      env(safe-area-inset-bottom, 0px)
  );
  pointer-events: none;
}

.mobile-bottom-tab-bar__pill {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.125rem;
  min-height: var(--echo-mobile-bottom-bar-pill-height, 3.25rem);
  padding: 0.3125rem 0.625rem;
  border-radius: 9999px;
  border: 1px solid
    color-mix(in srgb, rgba(255, 255, 255, 0.14) 55%, var(--border));
  background-color: var(--echo-mobile-tab-bar-pill-bg-fallback);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 10px 36px rgba(0, 0, 0, 0.42),
    0 2px 10px rgba(0, 0, 0, 0.28);
  isolation: isolate;
}

@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
  .mobile-bottom-tab-bar__pill {
    background-color: var(--echo-mobile-tab-bar-pill-bg);
    backdrop-filter: blur(22px) saturate(160%);
    -webkit-backdrop-filter: blur(22px) saturate(160%);
  }
}

.mobile-bottom-tab-bar__tab {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.875rem;
  height: 2.875rem;
  flex-shrink: 0;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: color-mix(in srgb, var(--foreground) 62%, transparent);
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    transform 0.12s ease;

  &:hover {
    color: var(--foreground);
  }

  &:active {
    transform: scale(0.94);
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
    outline-offset: 2px;
  }
}

.mobile-bottom-tab-bar__tab--active {
  color: var(--foreground);
  background: color-mix(in srgb, rgba(255, 255, 255, 0.12) 70%, transparent);
}

.mobile-bottom-tab-bar__tab--active .mobile-bottom-tab-bar__icon {
  opacity: 1;
}

.mobile-bottom-tab-bar__icon {
  opacity: 0.78;
  transition: opacity 0.18s ease;
}

.mobile-bottom-tab-bar__icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mobile-bottom-tab-bar__badge {
  position: absolute;
  top: -0.2rem;
  right: -0.35rem;
  min-width: 1.05rem;
  padding-inline: 0.25rem;
  border-radius: 9999px;
  background: var(--accent);
  color: #fff;
  font-size: 0.625rem;
  font-weight: 700;
  line-height: 1.05rem;
  text-align: center;
}

.mobile-bottom-tab-bar__dot {
  position: absolute;
  top: 0.05rem;
  right: 0.05rem;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: var(--accent);
  box-shadow: 0 0 0 2px var(--echo-mobile-tab-bar-pill-bg-fallback);
}

:global([data-theme='light']) .mobile-bottom-tab-bar__pill img.echo-ink-icon {
  filter: brightness(0) invert(1) !important;
  opacity: 0.82;
}

:global([data-theme='light'])
  .mobile-bottom-tab-bar__tab--active
  img.echo-ink-icon {
  opacity: 1;
}
</style>
