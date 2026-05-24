<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  message: string;
}>();

const emit = defineEmits<{
  dismiss: [];
}>();

const visible = ref(true);

function dismiss() {
  visible.value = false;
  emit('dismiss');
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="deploy-welcome-back fixed inset-x-0 top-0 z-[390] flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
      role="status"
      aria-live="polite"
    >
      <div
        class="deploy-welcome-back-card flex w-full max-w-2xl gap-3 rounded-2xl border border-border px-4 py-3 shadow-lg sm:items-start sm:px-5 sm:py-4"
      >
        <div
          class="deploy-welcome-back-icon mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          aria-hidden="true"
        >
          <svg
            class="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div class="min-w-0 flex-1 text-left">
          <p class="text-sm font-semibold text-fg">
            Welcome back — Echo is online
          </p>
          <p class="mt-1 text-sm leading-relaxed text-fg-soft">
            {{ message }}
          </p>
        </div>
        <button
          type="button"
          class="deploy-welcome-back-dismiss shrink-0 rounded-xl px-2 py-1 text-xs font-semibold text-fg-soft hover:bg-glass-hover hover:text-fg"
          aria-label="Dismiss update notice"
          @click="dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.deploy-welcome-back-card {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--elevated) 96%, rgb(34 197 94) 4%) 0%,
    color-mix(in srgb, var(--surface) 94%, var(--bg) 6%) 100%
  );
  backdrop-filter: blur(16px) saturate(1.15);
  -webkit-backdrop-filter: blur(16px) saturate(1.15);
}

.deploy-welcome-back-icon {
  background: color-mix(in srgb, rgb(34 197 94) 18%, var(--elevated) 82%);
  color: color-mix(in srgb, rgb(21 128 61) 90%, var(--text) 10%);
}

:global(html[data-theme='dark']) .deploy-welcome-back-card {
  background: linear-gradient(
    180deg,
    rgba(16, 24, 18, 0.94) 0%,
    rgba(10, 14, 12, 0.98) 100%
  );
  border-color: rgba(74, 222, 128, 0.22);
}

:global(html[data-theme='dark']) .deploy-welcome-back-icon {
  background: rgba(34, 197, 94, 0.18);
  color: rgb(134 239 172);
}
</style>
