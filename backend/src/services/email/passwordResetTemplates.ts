import { buildTransactionalEmailHtml } from './transactionalEmailHtml';

export function buildPasswordResetEmailContent(input: {
  username: string;
  resetUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = 'Reset your Echo password';
  const text = [
    `Hi ${input.username},`,
    '',
    'We received a request to reset the password for your Echo account.',
    '',
    'Open this link to choose a new password (valid for a limited time):',
    input.resetUrl,
    '',
    'If you did not request this, you can ignore this email.',
    '— Echo',
  ].join('\n');

  const html = buildTransactionalEmailHtml({
    documentTitle: subject,
    preheader: 'Use this link to set a new Echo password.',
    greetingName: input.username,
    bodyParagraphs: [
      'We received a request to reset the password for your Echo account.',
      'Choose a new password using the button below. This link is only valid for a limited time.',
    ],
    primaryCta: { label: 'Reset password', href: input.resetUrl },
    finePrint:
      'If you did not request a password reset, you can ignore this email.',
  });

  return { subject, text, html };
}
