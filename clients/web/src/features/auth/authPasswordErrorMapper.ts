import { AuthApiError } from '@/api/authClient';

export function mapForgotPasswordError(err: unknown): string {
  if (err instanceof AuthApiError) {
    return err.body.message || 'Something went wrong.';
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

export function mapResetPasswordError(err: unknown): string {
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
