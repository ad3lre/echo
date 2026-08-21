<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { useFocusTrap } from '@/features/layout/useFocusTrap';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    message: string;
    title?: string;
    variant?: 'error' | 'warning' | 'success';
  }>(),
  {
    title: 'Sign-in issue',
    variant: 'error',
  },
);

const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const panelClass = computed(() => {
  switch (props.variant) {
    case 'warning':
      return 'border-amber-500/25';
    case 'success':
      return 'border-emerald-500/25';
    default:
      return 'border-rose-500/25';
  }
});

const titleClass = computed(() => {
  switch (props.variant) {
    case 'warning':
      return 'text-amber-50';
    case 'success':
      return 'text-emerald-50';
    default:
      return 'text-rose-50';
  }
});

const bodyClass = computed(() => {
  switch (props.variant) {
    case 'warning':
      return 'text-amber-100/90';
    case 'success':
      return 'text-emerald-100/90';
    default:
      return 'text-rose-100/90';
  }
});

function dismiss() {
  emit('update:modelValue', false);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[175] flex items-end justify-center bg-overlay-heavy px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 sm:items-center sm:px-4 sm:pb-4"
      @click.self="dismiss"
    >
      <div
        ref="modalRef"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="auth-alert-title"
        aria-describedby="auth-alert-body"
        class="w-full max-w-md rounded-2xl border bg-[var(--echo-modal-bg)] p-5 text-foreground shadow-xl sm:p-6"
        :class="panelClass"
        @click.stop
      >
        <h2
          id="auth-alert-title"
          class="text-lg font-semibold"
          :class="titleClass"
        >
          {{ title }}
        </h2>
        <p
          id="auth-alert-body"
          class="mt-2 text-sm leading-relaxed"
          :class="bodyClass"
        >
          {{ message }}
        </p>
        <div class="mt-5 flex justify-end">
          <button
            type="button"
            class="rounded-lg bg-glass-2 px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-glass-active"
            @click="dismiss"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
