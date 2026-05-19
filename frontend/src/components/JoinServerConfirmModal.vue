<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    serverName: string;
    iconUrl?: string;
    memberCount?: number;
    subtitle?: string;
    isVoiceInvite?: boolean;
    busy?: boolean;
  }>(),
  { busy: false },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [];
}>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const displayName = computed(() => props.serverName.trim() || 'Server');

const iconSrc = computed(() =>
  safeImageUrl(serverGuildIconDisplayUrl(props.iconUrl)),
);

const memberLine = computed(() => {
  const n = props.memberCount;
  if (n == null || n < 1) return '';
  return `${n.toLocaleString()} member${n === 1 ? '' : 's'}`;
});

const detailLine = computed(() => {
  const sub = props.subtitle?.trim();
  if (sub) return sub;
  if (memberLine.value) return memberLine.value;
  return '';
});

function close() {
  if (props.busy) return;
  emit('update:modelValue', false);
}

function onConfirmJoin() {
  if (props.busy) return;
  emit('confirm');
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-[170] flex items-center justify-center modal-overlay-bg px-4"
    @click.self="close"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-server-title"
      class="join-server-confirm-modal real-glass-modal relative w-full max-w-md rounded-xl p-6 text-foreground bg-transparent"
    >
      <div
        class="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-xl bg-gradient-to-b from-indigo-500/25 to-transparent opacity-90"
      />

      <div class="relative">
        <h2
          id="join-server-title"
          class="text-lg font-bold leading-tight text-white"
        >
          {{ isVoiceInvite ? 'Join voice channel?' : 'Join this server?' }}
        </h2>

        <p class="mt-2 text-sm leading-relaxed text-fg-soft">
          {{
            isVoiceInvite
              ? 'You’ll join the server and connect to voice when you confirm.'
              : 'You’ll become a member and can see channels based on your roles.'
          }}
        </p>

        <div
          class="mt-5 flex items-center gap-3.5 rounded-xl border border-border/60 bg-glass-2/80 px-4 py-3.5"
        >
          <img
            :src="iconSrc"
            :alt="`${displayName} icon`"
            class="h-12 w-12 shrink-0 rounded-xl object-contain bg-glass-2 shadow-md"
          />
          <div class="min-w-0 flex-1">
            <div class="truncate text-base font-semibold text-foreground">
              {{ displayName }}
            </div>
            <p v-if="detailLine" class="mt-0.5 truncate text-sm text-fg-subtle">
              {{ detailLine }}
            </p>
            <p v-else-if="memberLine" class="mt-0.5 text-sm text-fg-subtle">
              {{ memberLine }}
            </p>
          </div>
        </div>

        <div
          class="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4"
        >
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-white disabled:pointer-events-none disabled:opacity-50"
            :disabled="busy"
            @click="close"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg bg-indigo-600/85 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:pointer-events-none disabled:opacity-60"
            :disabled="busy"
            @click="onConfirmJoin"
          >
            {{ busy ? 'Joining…' : 'Join' }}
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
