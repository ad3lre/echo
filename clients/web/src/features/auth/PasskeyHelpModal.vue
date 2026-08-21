<script setup lang="ts">
/**
 * Passkey help modal — the explicit fallback for passkey sign-in.
 *
 * The login slide arms conditional mediation (autofill) so most passkey users
 * never need this. It exists for the edge cases autofill can't surface: a
 * passkey stored on another device (cross-device / QR), or a username-scoped
 * credential the browser won't volunteer. `onSignIn` runs the real ceremony and
 * resolves with an error string, or null on success.
 */
import { nextTick, ref, toRef, watch } from 'vue';
import { useFocusTrap } from '@/features/layout/useFocusTrap';

const props = defineProps<{
  modelValue: boolean;
  onSignIn: (raw: string) => Promise<string | null>;
}>();

const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

const modalRef = ref<HTMLElement | null>(null);
const identInput = ref<HTMLInputElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const ident = ref('');
const busy = ref(false);
const errorMessage = ref('');

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      errorMessage.value = '';
      void nextTick(() => identInput.value?.focus());
    } else {
      ident.value = '';
      busy.value = false;
    }
  },
);

function dismiss() {
  if (busy.value) return;
  emit('update:modelValue', false);
}

async function submit() {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  const error = await props.onSignIn(ident.value);
  busy.value = false;
  if (error) {
    errorMessage.value = error;
    return;
  }
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
        class="passkey-help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="passkey-help-title"
      >
        <div class="passkey-help__glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h2 id="passkey-help-title" class="passkey-help__title">
          Sign in with a passkey
        </h2>
        <p class="passkey-help__blurb">
          If your passkey lives on another device, continue and pick “a phone,
          tablet, or security key” to scan the QR code. Add a username or email
          to target a specific passkey, or leave it blank.
        </p>

        <form class="passkey-help__form" @submit.prevent="submit">
          <label class="passkey-help__field">
            <span class="passkey-help__label">
              Username or email
              <span class="passkey-help__muted">(optional)</span>
            </span>
            <input
              ref="identInput"
              v-model="ident"
              type="text"
              autocomplete="username"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              class="passkey-help__input"
              placeholder="you@example.com"
              :disabled="busy"
            />
          </label>

          <p v-if="errorMessage" class="passkey-help__error" role="alert">
            {{ errorMessage }}
          </p>

          <div class="passkey-help__actions">
            <button
              type="button"
              class="passkey-help__btn passkey-help__btn--ghost"
              :disabled="busy"
              @click="dismiss"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="passkey-help__btn passkey-help__btn--primary"
              :disabled="busy"
            >
              {{ busy ? 'Waiting…' : 'Continue with a passkey' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.passkey-help {
  width: min(100%, 26rem);
  border-radius: 1.25rem;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
  background: var(--surface);
  padding: 1.5rem;
  box-shadow: 0 24px 60px color-mix(in srgb, var(--bg) 70%, transparent);
}

.passkey-help__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.9rem;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);

  svg {
    width: 1.5rem;
    height: 1.5rem;
  }
}

.passkey-help__title {
  margin: 0.9rem 0 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text);
}

.passkey-help__blurb {
  margin: 0.4rem 0 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--muted);
}

.passkey-help__form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-top: 1.1rem;
}

.passkey-help__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.passkey-help__label {
  font-size: 0.8rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--text) 70%, transparent);
}

.passkey-help__muted {
  color: var(--muted);
  font-weight: 400;
}

.passkey-help__input {
  width: 100%;
  min-height: 2.9rem;
  padding: 0.7rem 1rem;
  border-radius: 0.85rem;
  border: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
  background: color-mix(in srgb, var(--surface) 72%, var(--bg));
  color: var(--text);
  font-size: 1rem;
  outline: none;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;

  &::placeholder {
    color: color-mix(in srgb, var(--text) 38%, transparent);
  }

  &:focus {
    border-color: color-mix(in srgb, var(--accent) 65%, transparent);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent);
  }

  &:disabled {
    opacity: 0.55;
  }
}

.passkey-help__error {
  margin: 0;
  padding: 0.6rem 0.85rem;
  border-radius: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--vue-auto-082) 38%, transparent);
  background: color-mix(in srgb, var(--vue-auto-082) 12%, transparent);
  color: var(--vue-auto-082);
  font-size: 0.85rem;
  line-height: 1.4;
}

.passkey-help__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 0.25rem;
}

.passkey-help__btn {
  border-radius: 9999px;
  padding: 0.6rem 1.1rem;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    filter 0.18s ease,
    background 0.18s ease;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.passkey-help__btn--ghost {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text) 5%, var(--surface));
  }
}

.passkey-help__btn--primary {
  border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  background: var(--accent);
  color: var(--accent-contrast-fg);

  &:hover:not(:disabled) {
    filter: brightness(1.05);
  }
}
</style>
