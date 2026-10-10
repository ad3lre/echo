<script setup lang="ts">
defineProps<{
  fromDisplayName: string;
}>();

const emit = defineEmits<{
  release: [];
  dismiss: [];
}>();
</script>

<template>
  <div class="paper-lock-request-banner" role="status">
    <span class="paper-lock-request-banner__text">
      {{ fromDisplayName }} wants to edit this paragraph
    </span>
    <div class="paper-lock-request-banner__actions">
      <button
        type="button"
        class="paper-lock-request-banner__btn paper-lock-request-banner__btn--primary"
        @click="emit('release')"
      >
        Release
      </button>
      <button
        type="button"
        class="paper-lock-request-banner__btn"
        @click="emit('dismiss')"
      >
        Dismiss
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/PaperLockRequestBanner.scss"></style>
