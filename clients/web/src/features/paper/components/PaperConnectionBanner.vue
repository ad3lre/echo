<script setup lang="ts">
defineProps<{
  message: string;
  canReconnect?: boolean;
}>();

const emit = defineEmits<{
  dismiss: [];
  reconnect: [];
}>();
</script>

<template>
  <div class="paper-connection-banner" role="status">
    <span class="paper-connection-banner__text">{{ message }}</span>
    <div class="paper-connection-banner__actions">
      <button
        v-if="canReconnect"
        type="button"
        class="paper-connection-banner__btn paper-connection-banner__btn--primary"
        @click="emit('reconnect')"
      >
        Retry
      </button>
      <button
        type="button"
        class="paper-connection-banner__btn"
        aria-label="Dismiss"
        @click="emit('dismiss')"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/PaperConnectionBanner.scss"></style>
