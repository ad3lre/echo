import { echoT } from '@/i18n';
import { AuthApiError } from '@/api/authClient';

export function mapForgotPasswordError(err: unknown): string {
  if (err instanceof AuthApiError) {
    return err.body.message || echoT('auth.errors.somethingWentWrong');
  }
  if (err instanceof Error) return err.message;
  return echoT('auth.errors.somethingWentWrong');
}

export function mapResetPasswordError(err: unknown): string {
  if (err instanceof AuthApiError) {
    if (err.body.code === 'TOTP_REQUIRED') return '';
    if (err.body.code === 'INVALID_TOTP') {
      return echoT('auth.errors.invalidTotp');
    }
    if (err.body.code === 'INVALID_TOKEN') {
      return echoT('auth.errors.resetLinkInvalid');
    }
    return err.body.message || echoT('auth.errors.somethingWentWrong');
  }
  if (err instanceof Error) return err.message;
  return echoT('auth.errors.somethingWentWrong');
}
