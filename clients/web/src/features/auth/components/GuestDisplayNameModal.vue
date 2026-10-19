<script setup lang="ts">
import { echoT } from '@/i18n';
import { ref, watch, toRef } from 'vue';
import { useFocusTrap } from '@/features/layout/useFocusTrap';
import { useAutofocusOnOpen } from '@/features/layout/useAutofocusOnOpen';
import { authPatchMe } from '@/api/authClient';
import { trackEchoEvent } from '@/features/auth/analytics';
import { useAuthSessionStore } from '@/features/auth/authSession';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>();

const auth = useAuthSessionStore();
const name = ref('');
const err = ref('');
const busy = ref(false);
const modalRef = ref<HTMLElement | null>(null);
const displayNameInputRef = ref<HTMLInputElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

useAutofocusOnOpen(toRef(props, 'modelValue'), displayNameInputRef);

watch(
  () => props.modelValue,
  (o) => {
    if (o) {
      err.value = '';
      name.value = auth.backendUser?.displayName?.trim() || '';
    }
  },
);

async function submit() {
  const t = name.value.trim();
  if (!t) {
    err.value = echoT('auth.guestDisplayName.enterName');
    return;
  }
  if (!auth.isAuthenticated) return;
  busy.value = true;
  err.value = '';
  try {
    const { user } = await authPatchMe({ displayName: t });
    auth.applyRestoredProfile(user);
    if (user.isGuest) trackEchoEvent('guest_display_name_set');
    emit('saved');
    emit('update:modelValue', false);
  } catch (e) {
    err.value =
      e instanceof Error
        ? e.message
        : echoT('auth.guestDisplayName.saveFailed');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-[160] flex items-center justify-center bg-overlay-heavy px-4"
    @click.self="emit('update:modelValue', false)"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      class="w-full max-w-md rounded-2xl border border-border bg-[var(--echo-modal-bg)] p-6 text-foreground shadow-xl"
    >
      <h2 class="text-lg font-semibold">
        {{ echoT('auth.guestDisplayName.title') }}
      </h2>
      <p class="mt-1 text-sm text-fg-soft">
        {{ echoT('auth.guestDisplayName.blurb') }}
      </p>
      <input
        ref="displayNameInputRef"
        v-model="name"
        type="text"
        maxlength="80"
        class="mt-4 w-full rounded-lg border border-border bg-scrim-2 px-3 py-2 text-sm outline-none focus:border-indigo-400"
        :placeholder="echoT('auth.displayName')"
        @keydown.enter.prevent="submit"
      />
      <p v-if="err" class="mt-2 text-sm text-red-400">{{ err }}</p>
      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg px-3 py-2 text-sm text-fg-soft hover:bg-glass-hover"
          @click="emit('update:modelValue', false)"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
          :disabled="busy"
          @click="submit"
        >
          {{ busy ? 'Saving…' : 'Continue' }}
        </button>
      </div>
    </div>
  </div>
</template>
