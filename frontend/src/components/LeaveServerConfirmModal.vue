<script setup lang="ts">
import { ref, toRef } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';

const props = defineProps<{
  modelValue: boolean;
  /** confirm = leave flow; ownerBlocked = cannot leave until transfer */
  variant: 'confirm' | 'ownerBlocked';
  serverName: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [];
}>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

function close() {
  emit('update:modelValue', false);
}

function onConfirmLeave() {
  emit('confirm');
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
      :aria-labelledby="'leave-server-title'"
      class="leave-server-confirm-modal real-glass-modal relative w-full max-w-md rounded-xl p-6 text-foreground bg-transparent"
    >
      <div
        class="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-xl bg-gradient-to-b opacity-90"
        :class="
          variant === 'confirm'
            ? 'from-rose-500/25 to-transparent'
            : 'from-amber-500/20 to-transparent'
        "
      />

      <div class="relative">
        <h2
          id="leave-server-title"
          class="text-lg font-bold leading-tight text-white"
        >
          <template v-if="variant === 'confirm'">Leave server?</template>
          <template v-else>Can't leave this server</template>
        </h2>

        <p
          v-if="variant === 'confirm'"
          class="mt-3 text-sm leading-relaxed text-fg-soft"
        >
          Leave <span class="font-semibold text-fg">{{ serverName }}</span
          >? You won't be able to rejoin unless you have an invite.
        </p>
        <p v-else class="mt-3 text-sm leading-relaxed text-fg-soft">
          You own this server. Transfer ownership to another member in Server
          settings (Danger Zone) before you can leave.
        </p>

        <div
          class="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4"
        >
          <template v-if="variant === 'confirm'">
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-white"
              @click="close"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-rose-600/85 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-rose-600"
              @click="onConfirmLeave"
            >
              Leave server
            </button>
          </template>
          <button
            v-else
            type="button"
            class="rounded-lg bg-indigo-600/85 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-600"
            @click="close"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.modal-overlay-bg {
  background-color: var(--vue-auto-016);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.real-glass-modal {
  box-shadow: 0px 4px 60px var(--vue-auto-013);
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background-color: var(--vue-auto-015);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
  }
}
</style>
