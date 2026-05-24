<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps<{
  message: string | null;
  tone?: 'info' | 'warning' | 'error';
  durationMs?: number;
  persist?: boolean;
}>();

const emit = defineEmits<{
  dismiss: [];
}>();

let timer: ReturnType<typeof setTimeout> | null = null;

const shouldAutoDismiss = computed(
  () => !props.persist && props.tone !== 'warning',
);

function clearTimer() {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleDismiss() {
  clearTimer();
  if (!props.message || !shouldAutoDismiss.value) return;
  timer = setTimeout(() => emit('dismiss'), props.durationMs ?? 6000);
}

watch(() => [props.message, props.persist, props.tone], scheduleDismiss, {
  immediate: true,
});

onMounted(scheduleDismiss);
onUnmounted(clearTimer);
</script>

<template>
  <Transition name="paper-toast">
    <div
      v-if="message"
      class="paper-toast pointer-events-auto flex max-w-sm items-start gap-2 rounded-xl border border-border px-4 py-2.5 text-sm shadow-lg backdrop-blur-md"
      :class="{
        'paper-toast--warning': tone === 'warning',
        'paper-toast--error': tone === 'error',
      }"
      role="status"
    >
      <span class="min-w-0 flex-1">{{ message }}</span>
      <button
        type="button"
        class="paper-icon-btn shrink-0 rounded-md px-1.5 py-0.5 text-xs text-fg-subtle hover:bg-glass-hover hover:text-fg"
        aria-label="Dismiss"
        @click="emit('dismiss')"
      >
        ✕
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.paper-toast {
  background: var(--elevated);
  color: var(--text);
}

.paper-toast--warning {
  border-color: color-mix(
    in srgb,
    var(--paper-status-pending) 40%,
    var(--border)
  );
}

.paper-toast--error {
  border-color: color-mix(
    in srgb,
    var(--paper-status-error) 40%,
    var(--border)
  );
}

.paper-toast-enter-active,
.paper-toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.paper-toast-enter-from,
.paper-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
  .paper-toast-enter-active,
  .paper-toast-leave-active {
    transition: opacity 0.15s ease;
  }

  .paper-toast-enter-from,
  .paper-toast-leave-to {
    transform: none;
  }
}
</style>
