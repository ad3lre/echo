import { config } from '../config';

/** App URL after successful email verification (login with flash). */
export function getEmailVerifyRedirectUrl(): string {
  const base = config.echoAppPublicUrl.replace(/\/$/, '');
  return `${base}/login?emailVerified=1`;
}

/** App page that POSTs the verification token (fragment keeps token off server logs). */
export function buildSignupVerificationVerifyUrl(plainToken: string): string {
  const base = config.echoAppPublicUrl.replace(/\/$/, '');
  return `${base}/verify-email#token=${encodeURIComponent(plainToken)}`;
}
