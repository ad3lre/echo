<script setup lang="ts">
import { ref, watch, toRef } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import {
  getServerNotificationOptions,
  type ServerNotificationLevel,
} from '@/features/server-notifications/types';
import { icons } from '@/assets/icons';

const NOTIFICATION_LEVEL_ICON: Record<ServerNotificationLevel, string> = {
  all: icons.messageFilled,
  mentions: icons.hashtag,
  mentions_direct: icons.profileView,
  none: icons.notificationsOff,
};

const props = defineProps<{
  modelValue: boolean;
  serverName: string;
  currentLevel: ServerNotificationLevel;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [level: ServerNotificationLevel];
}>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const draft = ref<ServerNotificationLevel>(props.currentLevel);

watch(
  () => [props.modelValue, props.currentLevel] as const,
  ([open, level]) => {
    if (open) draft.value = level;
  },
);

function close() {
  emit('update:modelValue', false);
}

function selectLevel(level: ServerNotificationLevel) {
  draft.value = level;
  emit('save', level);
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-[150] flex items-center justify-center modal-overlay-bg px-4"
    @click.self="close"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="server-notif-title"
      tabindex="-1"
      class="real-glass-modal relative w-full max-w-lg rounded-xl p-6 text-foreground outline-none"
      @keydown.escape.prevent="close"
    >
      <h2 id="server-notif-title" class="text-xl font-bold text-foreground">
        Notification settings
      </h2>
      <p class="mt-1 text-sm text-muted">
        Choose what you get from
        <span class="font-semibold text-foreground">{{ serverName }}</span
        >. This applies only to you and syncs across your devices.
      </p>

      <ul
        class="mt-5 flex flex-col gap-2"
        role="radiogroup"
        aria-labelledby="server-notif-title"
      >
        <li v-for="opt in getServerNotificationOptions()" :key="opt.value">
          <button
            type="button"
            class="notif-option flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left transition-colors"
            :class="
              draft === opt.value
                ? 'notif-option--selected bg-accent/18'
                : 'bg-overlay-subtle hover:bg-glass-tint'
            "
            :aria-checked="draft === opt.value"
            role="radio"
            @click="selectLevel(opt.value)"
          >
            <img
              :src="NOTIFICATION_LEVEL_ICON[opt.value]"
              alt=""
              class="mt-0.5 h-5 w-5 shrink-0 opacity-90 filter invert"
            />
            <span class="min-w-0 flex-1 flex flex-col items-start">
              <span class="text-sm font-semibold text-foreground">{{
                opt.label
              }}</span>
              <span class="mt-1 text-xs text-muted">{{ opt.description }}</span>
            </span>
          </button>
        </li>
      </ul>

      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg px-4 py-2 text-sm font-semibold text-muted transition-colors hover:bg-glass-tint hover:text-foreground"
          @click="close"
        >
          Done
        </button>
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
  background: var(--chat-glass-bg-strong);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  box-shadow: 0 12px 48px var(--vue-auto-056);
}
</style>
