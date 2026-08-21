<script setup lang="ts">
import { useResetPasswordFlow } from '@/features/auth/useAuthPasswordFlow';

const emit = defineEmits<{
  done: [];
}>();

const {
  token,
  newPassword,
  confirmPassword,
  totpCode,
  showTotp,
  busy,
  errorMessage,
  successMessage,
  tokenPrefilledFromUrl,
  homeHref,
  minPasswordLength,
  canSubmit,
  submit,
} = useResetPasswordFlow(() => emit('done'));
</script>

<template>
  <div class="reset-page">
    <div class="reset-card">
      <h1 class="reset-title">Reset password</h1>
      <p class="reset-lead">
        Choose a new password for your Echo account. If you use two-factor
        authentication, you will be asked for a code.
      </p>

      <form class="reset-form" @submit.prevent="submit">
        <div
          v-if="tokenPrefilledFromUrl"
          class="reset-token-hint"
          role="status"
        >
          Reset link from email is ready. Enter your new password below.
        </div>
        <div v-else class="reset-field">
          <label class="reset-label" for="rp-token">Reset token</label>
          <input
            id="rp-token"
            v-model="token"
            type="text"
            autocomplete="one-time-code"
            class="reset-input"
            placeholder="Paste from email link"
          />
        </div>
        <div class="reset-field">
          <label class="reset-label" for="rp-new">New password</label>
          <input
            id="rp-new"
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            class="reset-input"
            :minlength="minPasswordLength"
          />
          <p class="reset-hint">
            At least {{ minPasswordLength }} characters (same as when you signed
            up).
          </p>
        </div>
        <div class="reset-field">
          <label class="reset-label" for="rp-confirm">Confirm password</label>
          <input
            id="rp-confirm"
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            class="reset-input"
          />
        </div>
        <div v-if="showTotp" class="reset-field">
          <label class="reset-label" for="rp-totp">Authenticator code</label>
          <input
            id="rp-totp"
            v-model="totpCode"
            type="text"
            inputmode="numeric"
            maxlength="10"
            autocomplete="one-time-code"
            class="reset-input"
            placeholder="000000"
          />
        </div>

        <p v-if="errorMessage" class="reset-err" role="alert">
          {{ errorMessage }}
        </p>
        <p v-if="successMessage" class="reset-ok" role="status">
          {{ successMessage }}
        </p>

        <button
          type="submit"
          class="reset-submit"
          :disabled="!canSubmit || busy"
        >
          {{ busy ? 'Updating…' : 'Update password' }}
        </button>
      </form>

      <p class="reset-footer">
        <a class="reset-link" :href="homeHref">Back to Echo</a>
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.reset-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  background: var(--bg);
  color: var(--text);
}

.reset-card {
  width: 100%;
  max-width: 28rem;
  border-radius: 1rem;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: var(--shadow-2);
  padding: 2rem;
}

.reset-title {
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.reset-lead {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--muted);
}

.reset-token-hint {
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--muted);
  padding: 0.65rem 0.85rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  background: var(--bg);
}

.reset-form {
  margin-top: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.reset-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.reset-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
}

.reset-hint {
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--muted);
}

.reset-input {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  padding: 0.65rem 0.85rem;
  font-size: 0.875rem;
  outline: none;
  transition: box-shadow 0.15s ease;

  &:focus {
    box-shadow: 0 0 0 2px var(--accent);
  }

  &::placeholder {
    color: var(--muted);
  }
}

.reset-err {
  font-size: 0.875rem;
  color: var(--set-danger-btn-fg);
}

.reset-ok {
  font-size: 0.875rem;
  color: var(--accent);
}

.reset-submit {
  margin-top: 0.25rem;
  width: 100%;
  border: none;
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  background: var(--accent);
  color: var(--accent-contrast-fg);
  transition: filter 0.15s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.reset-footer {
  margin-top: 1.25rem;
  text-align: center;
  font-size: 0.875rem;
}

.reset-link {
  color: var(--accent);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;

  &:hover {
    filter: brightness(1.08);
  }
}
</style>
