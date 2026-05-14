import type { FastifyBaseLogger } from 'fastify';
import type { AuthStore } from '../../auth/store';
import type { AuthUser } from '../../auth/types';
import { buildSignupVerificationVerifyUrl } from '../../domain/emailVerificationUrls';
import { sendTransactionalEmail } from '../email/sendMail';
import { buildSignupVerificationEmailContent } from '../email/verificationTemplates';

/**
 * Issues a token and sends (or logs) the signup verification email. Postgres-backed accounts only.
 */
export async function sendSignupVerificationEmail(
  log: FastifyBaseLogger,
  store: AuthStore,
  user: Pick<AuthUser, 'id' | 'username' | 'email' | 'emailVerified'>,
): Promise<void> {
  if (!user.email || user.emailVerified) return;
  try {
    const { plainToken } = await store.createEmailVerificationToken(
      user.id,
      'signup',
      {
        enforceResendCooldown: false,
      },
    );
    const verifyUrl = buildSignupVerificationVerifyUrl(plainToken);
    const { subject, text, html } = buildSignupVerificationEmailContent({
      username: user.username,
      verifyUrl,
    });
    await sendTransactionalEmail(log, { to: user.email, subject, text, html });
  } catch (err) {
    log.error(err, 'signup_verification_email_failed');
  }
}

export async function sendSignupVerificationResend(
  log: FastifyBaseLogger,
  store: AuthStore,
  user: Pick<AuthUser, 'id' | 'username' | 'email' | 'emailVerified'>,
): Promise<void> {
  if (!user.email || user.emailVerified) return;
  const { plainToken } = await store.createEmailVerificationToken(
    user.id,
    'signup',
    {
      enforceResendCooldown: true,
    },
  );
  const verifyUrl = buildSignupVerificationVerifyUrl(plainToken);
  const { subject, text, html } = buildSignupVerificationEmailContent({
    username: user.username,
    verifyUrl,
  });
  await sendTransactionalEmail(log, { to: user.email, subject, text, html });
}
