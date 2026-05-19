import { config } from '../config';

/** App URL after successful email verification (login with flash). */
export function getEmailVerifyRedirectUrl(): string {
  const base = config.echoAppPublicUrl.replace(/\/$/, '');
  return `${base}/login?emailVerified=1`;
}

/** API link embedded in the signup verification email. */
export function buildSignupVerificationVerifyUrl(plainToken: string): string {
  const base = config.echoApiPublicUrl.replace(/\/$/, '');
  return `${base}/api/v1/auth/verify-email?token=${encodeURIComponent(plainToken)}`;
}
