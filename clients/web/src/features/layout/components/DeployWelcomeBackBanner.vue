<script setup lang="ts">
import { echoT } from '@/i18n';
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
            {{ echoT('layout.deploy.welcomeBack') }}
          </p>
          <p class="mt-1 text-sm leading-relaxed text-fg-soft">
            {{ message }}
          </p>
        </div>
        <button
          type="button"
          class="deploy-welcome-back-dismiss shrink-0 rounded-xl px-2 py-1 text-xs font-semibold text-fg-soft hover:bg-glass-hover hover:text-fg"
          :aria-label="echoT('layout.deploy.dismissNoticeAria')"
          @click="dismiss"
        >
          {{ echoT('layout.deploy.dismiss') }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped src="./styles/DeployWelcomeBackBanner.scss"></style>
