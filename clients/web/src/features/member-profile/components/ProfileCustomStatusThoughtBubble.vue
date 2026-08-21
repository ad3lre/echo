<script setup lang="ts">
defineProps<{
  text: string;
}>();
</script>

<template>
  <div
    class="echo-profile-custom-status-chain"
    role="status"
    :aria-label="`Custom status: ${text}`"
  >
    <span class="echo-profile-custom-status-chain__dots" aria-hidden="true">
      <span
        class="echo-profile-custom-status-chain__dot echo-profile-custom-status-chain__dot--1"
      />
      <span
        class="echo-profile-custom-status-chain__dot echo-profile-custom-status-chain__dot--2"
      />
      <span
        class="echo-profile-custom-status-chain__dot echo-profile-custom-status-chain__dot--3"
      />
    </span>
    <span
      class="echo-profile-custom-status-cloud echo-profile-custom-status-chain__bubble"
    >
      {{ text }}
    </span>
  </div>
</template>
