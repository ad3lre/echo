import type { FastifyBaseLogger } from 'fastify';
import { config } from '../../config';
import type { AuthStore } from '../../auth/store';
import { sendTransactionalEmail } from '../email/sendMail';
import { buildPasswordResetEmailContent } from '../email/passwordResetTemplates';

function resetLink(plainToken: string): string {
  const base = config.echoAppPublicUrl.replace(/\/$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(plainToken)}`;
}

export async function sendPasswordResetEmail(
  log: FastifyBaseLogger,
  store: AuthStore,
  user: { id: string; username: string; email: string },
): Promise<void> {
  try {
    const { plainToken } = await store.createPasswordResetToken(user.id);
    const resetUrl = resetLink(plainToken);
    const { subject, text, html } = buildPasswordResetEmailContent({
      username: user.username,
      resetUrl,
    });
    await sendTransactionalEmail(log, { to: user.email, subject, text, html });
  } catch (err) {
    log.error(err, 'password_reset_email_failed');
  }
}
