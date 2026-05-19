<script setup lang="ts">
import { computed } from 'vue';
import type { AuthSessionInfo } from '@/api/authClient';
import {
  parseAuthSessionUserAgent,
  type ParsedClientEnvironment,
} from '@/utils/authSessionDeviceLabel';

const props = defineProps<{
  modelValue: boolean;
  sessions: AuthSessionInfo[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

function labelFor(s: AuthSessionInfo): ParsedClientEnvironment {
  return parseAuthSessionUserAgent(s.userAgent);
}

const hasRows = computed(() => props.sessions.length > 0);

function close() {
  emit('update:modelValue', false);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[240] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-auth-session-title"
      @click.self="close"
    >
      <div
        class="max-h-[min(520px,85dvh)] w-full max-w-md overflow-hidden rounded-2xl border border-border bg-[color:var(--bg)] shadow-2xl"
        @click.stop
      >
        <div class="border-b border-border px-5 py-4">
          <h2
            id="new-auth-session-title"
            class="text-base font-bold text-foreground"
          >
            New sign-in on your account
          </h2>
          <p class="mt-1 text-sm text-fg-subtle">
            A session was created from a device we have not seen in this browser
            before. If this was not you, revoke it under Settings → Account →
            Active Sessions and change your password.
          </p>
        </div>
        <div
          v-if="hasRows"
          class="max-h-[min(280px,40dvh)] overflow-y-auto px-5 py-3 custom-scrollbar"
        >
          <ul class="flex flex-col gap-2">
            <li
              v-for="s in sessions"
              :key="s.id"
              class="rounded-xl border border-border bg-glass-1 px-3 py-2.5"
            >
              <div class="text-sm font-semibold text-foreground">
                {{ labelFor(s).os }}
              </div>
              <div class="text-xs text-fg-subtle">
                {{ labelFor(s).device }}
              </div>
            </li>
          </ul>
        </div>
        <div class="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            class="rounded-lg border border-border bg-glass-1 px-3 py-2 text-sm font-semibold text-fg-soft hover:bg-glass-hover"
            @click="close"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
