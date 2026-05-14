import { computed, onMounted, ref } from 'vue';
import {
  AuthApiError,
  authForgotPassword,
  authResetPassword,
} from '@/api/authClient';
import { withBasePath } from '@/features/layout/urlNavigation';
import {
  isValidEmailFormat,
  MIN_ACCOUNT_PASSWORD_LENGTH,
  normalizeEmail,
} from '@/utils/accountValidation';

function baseHomeHref() {
  return withBasePath('/', import.meta.env.BASE_URL || '/');
}

function mapForgotPasswordError(err: unknown): string {
  if (err instanceof AuthApiError) {
    return err.body.message || 'Something went wrong.';
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

function mapResetPasswordError(err: unknown): string {
  if (err instanceof AuthApiError) {
    if (err.body.code === 'TOTP_REQUIRED') return '';
    if (err.body.code === 'INVALID_TOTP') {
      return 'That authenticator code is not valid.';
    }
    if (err.body.code === 'INVALID_TOKEN') {
      return 'This reset link is invalid or has expired.';
    }
    return err.body.message || 'Something went wrong.';
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

export function useForgotPasswordFlow(onDone: () => void) {
  const email = ref('');
  const busy = ref(false);
  const errorMessage = ref('');
  const successMessage = ref('');

  const homeHref = computed(() => baseHomeHref());
  const canSubmit = computed(
    () =>
      Boolean(normalizeEmail(email.value)) &&
      isValidEmailFormat(email.value.trim()),
  );

  async function submit() {
    if (!canSubmit.value) return;
    busy.value = true;
    errorMessage.value = '';
    successMessage.value = '';
    try {
      const normalizedEmail = normalizeEmail(email.value);
      if (!normalizedEmail) return;
      const result = await authForgotPassword({ email: normalizedEmail });
      successMessage.value =
        result.message ||
        'If an account exists for that email, you will receive reset instructions.';
    } catch (e) {
      errorMessage.value = mapForgotPasswordError(e);
    } finally {
      busy.value = false;
    }
  }

  function goHome() {
    window.history.replaceState(null, '', homeHref.value);
    onDone();
  }

  return {
    email,
    busy,
    errorMessage,
    successMessage,
    homeHref,
    canSubmit,
    submit,
    goHome,
  };
}

export function useResetPasswordFlow(onDone: () => void) {
  const token = ref('');
  const newPassword = ref('');
  const confirmPassword = ref('');
  const totpCode = ref('');
  const showTotp = ref(false);
  const busy = ref(false);
  const errorMessage = ref('');
  const successMessage = ref('');
  const tokenPrefilledFromUrl = ref(false);

  const homeHref = computed(() => baseHomeHref());
  const canSubmit = computed(
    () =>
      token.value.trim().length >= 10 &&
      newPassword.value.length >= MIN_ACCOUNT_PASSWORD_LENGTH &&
      newPassword.value === confirmPassword.value,
  );

  onMounted(() => {
    const urlToken = new URLSearchParams(window.location.search).get('token');
    if (!urlToken) return;
    token.value = urlToken;
    tokenPrefilledFromUrl.value = true;
  });

  async function submit() {
    if (!canSubmit.value) return;
    busy.value = true;
    errorMessage.value = '';
    successMessage.value = '';
    try {
      const result = await authResetPassword({
        token: token.value.trim(),
        newPassword: newPassword.value,
        ...(totpCode.value.trim() ? { totpCode: totpCode.value.trim() } : {}),
      });
      successMessage.value =
        result.message ||
        'Password updated. You can close this page and sign in.';
      showTotp.value = false;
      try {
        sessionStorage.setItem('echo_post_password_reset', '1');
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        const path = window.location.pathname.replace(/\/$/, '');
        const base = path.replace(/\/reset-password$/i, '') || '/';
        window.history.replaceState(null, '', base);
        onDone();
      }, 2000);
    } catch (e) {
      if (e instanceof AuthApiError && e.body.code === 'TOTP_REQUIRED') {
        showTotp.value = true;
        errorMessage.value =
          'Enter the 6-digit code from your authenticator app to finish resetting your password.';
      } else {
        errorMessage.value = mapResetPasswordError(e);
      }
    } finally {
      busy.value = false;
    }
  }

  return {
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
    minPasswordLength: MIN_ACCOUNT_PASSWORD_LENGTH,
    canSubmit,
    submit,
  };
}
