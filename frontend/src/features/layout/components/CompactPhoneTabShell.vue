<script setup lang="ts">
import { ref, watch } from 'vue';
import { useCompactShellVisualViewportFrame } from '@/composables/useCompactShellVisualViewportFrame';
import { useMobileBottomBarInsetReporter } from '@/features/layout/composables/useMobileBottomBarInsetReporter';
import MobileBottomTabBar from '@/features/layout/components/MobileBottomTabBar.vue';
import type { MobileBottomTabId } from '@/features/layout/mobileBottomTab';

const props = defineProps<{
  modelValue: MobileBottomTabId;
  showBar?: boolean;
  dmUnreadTotal?: number;
  serversHasActivity?: boolean;
  exploreHasActivity?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: MobileBottomTabId];
}>();

const { rootStyle } = useCompactShellVisualViewportFrame();
const tabBarRef = ref<InstanceType<typeof MobileBottomTabBar> | null>(null);
const barEl = ref<HTMLElement | null>(null);

watch(
  () => tabBarRef.value?.barEl,
  (el) => {
    barEl.value = el ?? null;
  },
  { immediate: true },
);

useMobileBottomBarInsetReporter(barEl);
</script>

<template>
  <div
    class="compact-phone-tab-shell flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    :class="{ 'compact-phone-tab-shell--no-bar': showBar === false }"
    :style="rootStyle"
  >
    <div
      class="compact-phone-tab-shell__content flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <slot />
    </div>
    <MobileBottomTabBar
      v-if="showBar !== false"
      ref="tabBarRef"
      :model-value="modelValue"
      :dm-unread-total="dmUnreadTotal"
      :servers-has-activity="serversHasActivity"
      :explore-has-activity="exploreHasActivity"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped lang="scss">
.compact-phone-tab-shell {
  --echo-mobile-bottom-bar-pill-height: 3.25rem;
  --echo-mobile-bottom-bar-float-gap: 0.625rem;
  --echo-mobile-bottom-bar-height: calc(
    var(--echo-mobile-bottom-bar-pill-height) +
      var(--echo-mobile-bottom-bar-float-gap)
  );
}

.compact-phone-tab-shell--no-bar {
  --echo-mobile-bottom-bar-height: 0px;
}
</style>
