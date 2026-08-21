<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <div
    class="settings-setting-row flex flex-col gap-3 py-4 sm:min-h-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
  >
    <div class="min-w-0 flex-1">
      <div class="text-sm font-semibold tracking-tight text-fg">
        {{ title }}
      </div>
      <p
        v-if="description"
        class="mt-1 max-w-prose text-xs leading-relaxed text-fg-subtle"
      >
        {{ description }}
      </p>
    </div>
    <!-- Isolated control column: padding keeps toggles clear of scroll/rounded edges -->
    <div
      class="settings-setting-row__control flex shrink-0 items-center justify-end gap-2 sm:justify-center sm:pl-4 sm:pr-1"
    >
      <slot name="control" />
    </div>
  </div>
</template>
