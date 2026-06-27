<script setup lang="ts">
import { computed } from 'vue';
import { useInstancePolicyStore } from '@/stores/instancePolicy';

const store = useInstancePolicyStore();

const regions = computed(() => store.voiceRegions.available);
const defaultRegion = computed(() => store.voiceRegions.default);
const show = computed(() => store.loaded && regions.value.length > 0);
</script>

<template>
  <div
    v-if="show"
    class="rounded-md border border-border bg-elevated/40 px-3 py-2 text-[12px] text-fg-soft"
  >
    <p class="font-semibold text-fg">Advertised voice regions</p>
    <p class="mt-1">
      Default:
      <span class="text-fg">{{ defaultRegion }}</span>
    </p>
    <ul class="mt-1 list-inside list-disc">
      <li v-for="region in regions" :key="region.id">
        {{ region.name }}
        <span v-if="region.optimal" class="text-accent"> (recommended)</span>
      </li>
    </ul>
    <p class="mt-1 text-[11px] opacity-80">
      Routing is configured on the LiveKit deployment; labels come from
      <code class="text-fg">echo.instance.json</code>.
    </p>
  </div>
</template>
