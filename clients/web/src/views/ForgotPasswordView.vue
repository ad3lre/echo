<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useForgotPasswordFlow } from '@/features/auth/useAuthPasswordFlow';

const { t } = useI18n();

const emit = defineEmits<{
  done: [];
}>();

const { email, busy, errorMessage, successMessage, canSubmit, submit, goHome } =
  useForgotPasswordFlow(() => emit('done'));
</script>

<template>
  <div class="forgot-page">
    <div class="forgot-card">
      <h1 class="forgot-title">{{ t('auth.forgotPasswordTitle') }}</h1>
      <p class="forgot-lead">
        {{ t('auth.forgotPasswordLead') }}
      </p>

      <form class="forgot-form" @submit.prevent="submit">
        <div class="forgot-field">
          <label class="forgot-label" for="fp-email">{{
            t('auth.email')
          }}</label>
          <input
            id="fp-email"
            v-model="email"
            type="email"
            inputmode="email"
            autocomplete="email"
            class="forgot-input"
            placeholder="you@example.com"
          />
        </div>

        <p v-if="errorMessage" class="forgot-err" role="alert">
          {{ errorMessage }}
        </p>
        <p v-if="successMessage" class="forgot-ok" role="status">
          {{ successMessage }}
        </p>

        <button
          type="submit"
          class="forgot-submit"
          :disabled="!canSubmit || busy"
        >
          {{ busy ? 'Sending…' : 'Send reset link' }}
        </button>
      </form>

      <p class="forgot-footer">
        <button type="button" class="forgot-link" @click="goHome">
          Back to Echo
        </button>
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.forgot-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  background: var(--bg);
  color: var(--text);
}

.forgot-card {
  width: 100%;
  max-width: 28rem;
  border-radius: 1rem;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: var(--shadow-2);
  padding: 2rem;
}

.forgot-title {
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.forgot-lead {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--muted);
}

.forgot-form {
  margin-top: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.forgot-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.forgot-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
}

.forgot-input {
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

.forgot-err {
  font-size: 0.875rem;
  color: var(--set-danger-btn-fg);
}

.forgot-ok {
  font-size: 0.875rem;
  color: var(--accent);
}

.forgot-submit {
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

.forgot-footer {
  margin-top: 1.25rem;
  text-align: center;
  font-size: 0.875rem;
}

.forgot-link {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--accent);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;

  &:hover {
    filter: brightness(1.08);
  }
}
</style>
