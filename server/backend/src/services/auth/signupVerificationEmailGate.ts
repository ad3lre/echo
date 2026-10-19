import type { FastifyBaseLogger } from 'fastify';
import type { AuthStore } from '../../auth/store/types';
import type { AuthUser } from '../../auth/types';
import { emailVerifyLockEnforced } from '../../auth/emailVerifyLockPolicy';
import { sendSignupVerificationEmail } from './emailVerificationActions';

/**
 * When test isolation softens the email-verify lock, register/upgrade auto-verify
 * immediately. Skip the async signup email in that case — it races the auto-verify
 * path on `auth_users … FOR UPDATE` and can deadlock.
 */
export function maybeSendSignupVerificationEmail(
  mode: string,
  log: FastifyBaseLogger,
  store: AuthStore,
  user: AuthUser,
): void {
  const email = user.email?.trim() ?? '';
  if (mode !== 'postgres' || !email || user.emailVerified) return;
  if (!emailVerifyLockEnforced()) return;
  void sendSignupVerificationEmail(log, store, user);
}
