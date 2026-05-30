<script setup lang="ts">
import { ref, watch, toRef } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useAutofocusOnOpen } from '@/composables/useAutofocusOnOpen';
import { authPatchMe } from '@/api/authClient';
import { trackEchoEvent } from '@/utils/analytics';
import { useAuthSessionStore } from '@/stores/authSession';

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
    err.value = 'Enter a name to show in chat.';
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
    err.value = e instanceof Error ? e.message : 'Could not save';
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
      <h2 class="text-lg font-semibold">Choose your display name</h2>
      <p class="mt-1 text-sm text-fg-soft">
        This is how others see you in chat. You can change it later.
      </p>
      <input
        ref="displayNameInputRef"
        v-model="name"
        type="text"
        maxlength="80"
        class="mt-4 w-full rounded-lg border border-border bg-scrim-2 px-3 py-2 text-sm outline-none focus:border-indigo-400"
        placeholder="Display name"
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
