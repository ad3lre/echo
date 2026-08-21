<script setup lang="ts">
import { ref, toRef } from 'vue';
import { useFocusTrap } from '@/features/layout/useFocusTrap';
import GuestAccountUpgradePanel from '@/features/settings/GuestAccountUpgradePanel.vue';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  'update:modelValue': [boolean];
  upgraded: [];
  'sign-in-existing': [];
}>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

function close() {
  emit('update:modelValue', false);
}

function onPanelUpgraded() {
  emit('upgraded');
  emit('update:modelValue', false);
}

function onSignInExisting() {
  emit('sign-in-existing');
  emit('update:modelValue', false);
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-[160] flex items-center justify-center modal-overlay-bg px-4"
    @click.self="close"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-upgrade-title"
      class="real-glass-modal relative w-full max-w-md rounded-xl p-6 text-foreground outline-none"
    >
      <div class="guest-upgrade-accent" aria-hidden="true" />

      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2
            id="guest-upgrade-title"
            class="text-xl font-bold tracking-tight text-foreground"
          >
            Save your account
          </h2>
          <p class="mt-2 text-sm leading-relaxed text-muted">
            Add email and password to unlock Friends, join more servers, and
            keep your messages across devices.
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-xl p-2 text-muted transition hover:bg-glass-tint hover:text-foreground"
          aria-label="Close"
          @click="close"
        >
          <svg
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <GuestAccountUpgradePanel
        class="mt-5"
        :active="modelValue"
        variant="modal"
        :show-intro="false"
        @dismiss="close"
        @upgraded="onPanelUpgraded"
        @sign-in-existing="onSignInExisting"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.modal-overlay-bg {
  background-color: color-mix(in srgb, var(--vue-auto-016) 92%, black 8%);
  /* Light overlay only — heavy blur is expensive while typing in the dialog. */
}

.real-glass-modal {
  background: var(--chat-glass-bg-strong);
  box-shadow: 0 8px 32px var(--vue-auto-056);
  border: 1px solid color-mix(in srgb, var(--vue-auto-002) 55%, transparent);
}

.guest-upgrade-accent {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  border-radius: 12px 12px 0 0;
  background: linear-gradient(
    90deg,
    var(--vue-auto-081),
    var(--vue-auto-169),
    var(--vue-auto-170)
  );
  opacity: 0.75;
  pointer-events: none;
}
</style>
