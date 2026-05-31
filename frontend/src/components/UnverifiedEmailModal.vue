<script setup lang="ts">
import { ref, toRef } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';

const props = defineProps<{
  modelValue: boolean;
  resendBusy?: boolean;
  resendMessage?: string | null;
  resendError?: string | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [boolean];
  resend: [];
  'change-email': [];
}>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

function dismiss() {
  emit('update:modelValue', false);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[165] flex items-end justify-center bg-overlay-heavy px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 sm:items-center sm:px-4 sm:pb-4"
      @click.self="dismiss"
    >
      <div
        ref="modalRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unverified-email-title"
        class="w-full max-w-md rounded-2xl border border-sky-500/25 bg-[var(--echo-modal-bg)] p-5 text-foreground shadow-xl sm:p-6"
        @click.stop
      >
        <h2
          id="unverified-email-title"
          class="text-lg font-semibold text-sky-50"
        >
          Verify your email
        </h2>
        <p class="mt-2 text-sm leading-relaxed text-sky-100/90">
          Verify your email to secure your account. Check your inbox for the
          link we sent.
        </p>
        <p
          v-if="resendMessage"
          class="mt-2 text-sm font-medium text-sky-100/95"
        >
          {{ resendMessage }}
        </p>
        <p v-if="resendError" class="mt-2 text-sm text-rose-100">
          {{ resendError }}
        </p>
        <div
          class="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end"
        >
          <button
            type="button"
            class="order-3 rounded-lg px-3 py-2 text-sm font-medium text-sky-100/80 transition-colors hover:bg-glass-hover hover:text-sky-50 sm:order-1"
            @click="dismiss"
          >
            Dismiss
          </button>
          <button
            type="button"
            class="order-2 rounded-lg bg-glass-2 px-4 py-2.5 text-sm font-semibold text-sky-50 transition-colors hover:bg-glass-active"
            @click="emit('change-email')"
          >
            Change email
          </button>
          <button
            type="button"
            class="order-1 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-400 disabled:opacity-50 sm:order-3"
            :disabled="resendBusy"
            @click="emit('resend')"
          >
            {{ resendBusy ? 'Sending…' : 'Resend email' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
