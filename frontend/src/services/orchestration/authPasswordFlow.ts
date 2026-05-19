import { type Ref } from 'vue';
import {
  AuthApiError,
  authForgotPassword,
  authResetPassword,
} from '@/api/authClient';
import { normalizeEmail } from '@/utils/accountValidation';

import {
  mapForgotPasswordError,
  mapResetPasswordError,
} from '@/services/domain/authPasswordErrorMapper';

export type AuthPasswordFlowController = {
  submitForgotPassword: (email: string) => Promise<void>;
  submitResetPassword: (opts: {
    token: string;
    newPassword: string;
    totpCode?: string;
  }) => Promise<{ success: boolean; totpRequired?: boolean }>;
};

export function createAuthPasswordFlowController(deps: {
  busy: Ref<boolean>;
  errorMessage: Ref<string>;
  successMessage: Ref<string>;
  showTotp?: Ref<boolean>;
}): AuthPasswordFlowController {
  const { busy, errorMessage, successMessage, showTotp } = deps;

  return {
    async submitForgotPassword(email: string) {
      busy.value = true;
      errorMessage.value = '';
      successMessage.value = '';
      try {
        const normalizedEmail = normalizeEmail(email);
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
    },

    async submitResetPassword(opts) {
      busy.value = true;
      errorMessage.value = '';
      successMessage.value = '';
      try {
        const result = await authResetPassword({
          token: opts.token.trim(),
          newPassword: opts.newPassword,
          ...(opts.totpCode?.trim() ? { totpCode: opts.totpCode.trim() } : {}),
        });
        successMessage.value =
          result.message ||
          'Password updated. You can close this page and sign in.';
        if (showTotp) showTotp.value = false;

        try {
          sessionStorage.setItem('echo_post_password_reset', '1');
        } catch {
          /* ignore */
        }
        return { success: true };
      } catch (e) {
        if (e instanceof AuthApiError && e.body.code === 'TOTP_REQUIRED') {
          if (showTotp) showTotp.value = true;
          errorMessage.value =
            'Enter the 6-digit code from your authenticator app to finish resetting your password.';
          return { success: false, totpRequired: true };
        } else {
          errorMessage.value = mapResetPasswordError(e);
          return { success: false };
        }
      } finally {
        busy.value = false;
      }
    },
  };
}
