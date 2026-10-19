<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed } from 'vue';
const props = defineProps<{
  baseline: string[]; // permissions strings
  current: string[];
  traces?: unknown[]; // optional timeline entries
}>();

const baselineSet = computed(() => new Set(props.baseline || []));
const currentSet = computed(() => new Set(props.current || []));

const added = computed(() =>
  [...currentSet.value].filter((p) => !baselineSet.value.has(p)),
);
const removed = computed(() =>
  [...baselineSet.value].filter((p) => !currentSet.value.has(p)),
);
</script>

<template>
  <div class="permission-diff rounded-lg bg-scrim-1 p-3 text-sm space-y-3">
    <div class="font-semibold">{{ echoT('srvSettingsB.permDiff.title') }}</div>
    <div v-if="!baseline || !current" class="text-fg-soft">
      {{ echoT('srvSettingsB.permDiff.none') }}
    </div>
    <div v-else class="grid grid-cols-2 gap-3">
      <div>
        <div class="text-xs text-fg-soft mb-1">
          {{ echoT('srvSettingsB.permDiff.added') }}
        </div>
        <ul class="list-disc list-inside">
          <li v-for="p in added" :key="p" class="echo-success-text">{{ p }}</li>
          <li v-if="added.length === 0" class="text-fg-subtle">—</li>
        </ul>
      </div>
      <div>
        <div class="text-xs text-fg-soft mb-1">
          {{ echoT('srvSettingsB.permDiff.removed') }}
        </div>
        <ul class="list-disc list-inside">
          <li v-for="p in removed" :key="p" class="echo-destructive-text">
            {{ p }}
          </li>
          <li v-if="removed.length === 0" class="text-fg-subtle">—</li>
        </ul>
      </div>
    </div>

    <div v-if="traces && traces.length" class="mt-2">
      <div class="text-xs text-fg-soft mb-1">
        {{ echoT('srvSettingsB.permDiff.trace') }}
      </div>
      <div
        class="max-h-36 overflow-y-auto rounded-md bg-scrim-1 p-2 text-[12px]"
      >
        <div
          v-for="(t, i) in traces"
          :key="i"
          class="mb-2 border-b border-white/5 pb-1"
        >
          <pre class="whitespace-pre-wrap text-fg-soft">{{
            JSON.stringify(t, null, 2)
          }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
